import { logger } from '../logger.js';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantResponse {
  content: string;
  category: string;
  confidence: number;
}

type KnowledgeEntry = {
  keywords: string[];
  answer: string;
  category: string;
};

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // ── STUDIO / DAW ──────────────────────────────────────────────────────────
  {
    keywords: ['studio', 'daw', 'digital audio workstation', 'record', 'recording', 'tracks', 'track', 'how to use studio', 'open studio'],
    category: 'studio',
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

The Studio interface is modeled after Studio One for a professional-grade workflow. No browser plugins or installs needed — it runs entirely in-app.`,
  },
  {
    keywords: ['ai mix', 'ai mixing', 'mixing', 'eq', 'compression', 'master', 'mastering', 'ai master', 'loudness', 'lufs', 'finish track', 'polish'],
    category: 'studio',
    answer: `AI Mixing & Mastering is powered by Max Booster's custom in-house AI engine — no third-party APIs.

**AI Mixer:**
• Automatic level balancing across all tracks
• Intelligent EQ for each track based on genre and frequency analysis
• Genre-aware dynamic compression
• Stereo imaging and spatial positioning
• Reverb and delay send automation

**AI Mastering:**
• Multi-band compression for punch and clarity
• Adaptive EQ to correct tonal imbalances
• Stereo widening to professional width
• Loudness optimization targeting streaming standards:
  - Spotify: -14 LUFS
  - Apple Music: -16 LUFS
  - YouTube: -14 LUFS

**How to use:**
1. Open your project in Studio
2. Click "AI Tools" in the top toolbar
3. Choose "AI Mix" (for track mixing) or "AI Master" (final polish)
4. Select your target genre/style
5. Hit Process — results in seconds

This replaces thousands of dollars in professional mixing/mastering services.`,
  },
  {
    keywords: ['ai generator', 'generate beat', 'generate music', 'generate melody', 'text to music', 'create beat', 'beat from scratch', 'ai generate', 'generate from text'],
    category: 'studio',
    answer: `The AI Generator creates original beats, melodies, chord progressions, and full instrumentals from text descriptions — all powered by our in-house AdvancedMusicAI model.

**How to use:**
1. In Studio, click "AI Generator" in the toolbar
2. Type a description like "dark trap beat with 808s at 140 BPM" or "lo-fi jazz piano with vinyl crackle"
3. Choose duration (8, 16, 32, or 64 bars)
4. Hit Generate — your track appears as a new project

**The AI understands:**
• Genres (trap, R&B, pop, jazz, rock, EDM, afrobeats, and 50+ more)
• Mood descriptors (dark, uplifting, melancholic, energetic, chill)
• Instrumentation requests (808s, piano, strings, brass, etc.)
• Tempo and key specifications
• Structural cues (verse, chorus, bridge patterns)

All generated music is 100% yours to use, sell, or distribute.`,
  },
  {
    keywords: ['midi', 'piano roll', 'midi editor', 'midi notes', 'midi instrument', 'virtual instrument', 'vst', 'plugin'],
    category: 'studio',
    answer: `The MIDI editor and virtual instruments in Max Booster Studio give you full in-box production capability.

**MIDI Piano Roll:**
• Draw, edit, and delete MIDI notes with precision
• Velocity editing per note
• Quantization (1/4, 1/8, 1/16, 1/32 note grids)
• Humanize function for natural feel
• Chord mode for quick harmonic composition

**Built-in Virtual Instruments:**
• Synthesizers (subtractive, FM, wavetable)
• Sampler (load your own samples)
• Drum machines with step sequencer
• Realistic piano and guitar
• Full orchestral string and brass sections

**MIDI Note:** For MIDI hardware (keyboards, controllers), you may be prompted for MIDI device permission in your browser — this only appears on the Studio page.`,
  },
  {
    keywords: ['export', 'bounce', 'download track', 'wav', 'mp3', 'flac', 'stems', 'export project'],
    category: 'studio',
    answer: `Exporting your finished music from Max Booster Studio:

**Export Options:**
• **WAV** — Full lossless quality (16-bit or 24-bit, 44.1kHz or 48kHz)
• **MP3** — Compressed, smaller file (128, 192, or 320 kbps)
• **FLAC** — Lossless compressed (ideal for distribution masters)
• **Stems** — Export each track individually for collaboration or licensing

**How to export:**
1. In Studio, go to File → Export
2. Choose your format and quality settings
3. Select export range (all, loop, or selection)
4. Click Export and your file downloads immediately

**For distribution:** Use WAV or FLAC at 24-bit for the highest quality master. The distribution system accepts these formats directly.`,
  },

  // ── DISTRIBUTION ──────────────────────────────────────────────────────────
  {
    keywords: ['distribution', 'distribute', 'release music', 'upload music', 'submit music', 'put music on spotify', 'streaming', 'get on spotify', 'apple music', 'new release'],
    category: 'distribution',
    answer: `Max Booster distributes your music to 150+ streaming platforms worldwide — and you keep 100% of your royalties.

**Step-by-Step Distribution:**
1. Go to **Distribution** in the sidebar
2. Click **"New Release"**
3. Upload your audio file (WAV or FLAC recommended, minimum 16-bit/44.1kHz)
4. Upload cover art (3000 × 3000 pixels, JPG or PNG, no text covering faces)
5. Fill in metadata:
   - Song/album title
   - Artist name
   - Genre and subgenre
   - Release date
   - ISRC code (auto-generated if you don't have one)
6. Select platforms (all 150+ or pick specific ones)
7. Set royalty splits if you have collaborators
8. Submit for review

**Timeline:**
• Review: 24–48 hours
• Live on platforms: 1–3 business days after approval
• Recommendation: Submit at least 2 weeks before your target release date for playlist pitching opportunities

**You keep 100% of royalties.** No commission, no hidden fees.`,
  },
  {
    keywords: ['platforms', 'which platforms', 'streaming platforms', 'where distributed', 'tidal', 'deezer', 'amazon music', 'youtube music', 'pandora'],
    category: 'distribution',
    answer: `Max Booster distributes to 150+ platforms including every major service:

**Major Streaming:**
Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, Deezer, Pandora, iHeartRadio, Napster, Boomplay

**Social Media:**
TikTok, Instagram/Facebook (Meta), Snapchat, Triller

**International Markets:**
• China: NetEase Music, QQ Music, Kugou
• India: JioSaavn, Gaana, Wynk
• Middle East: Anghami
• Africa: Boomplay
• South Korea: Melon, Genie
• Japan: AWA, Line Music

**Video Platforms:**
YouTube Content ID (monetizes any use of your music in videos)

You can distribute to all 150+ platforms at once or select specific ones. No extra charge per platform — all included in your subscription.`,
  },
  {
    keywords: ['isrc', 'isrc code', 'upc', 'barcode', 'release code', 'copyright'],
    category: 'distribution',
    answer: `ISRC and UPC codes identify your music worldwide — Max Booster handles both automatically.

**ISRC (International Standard Recording Code):**
• Unique code for each individual track/recording
• Required for streaming distribution
• Max Booster auto-generates an ISRC for every track you distribute if you don't already have one
• If you have existing ISRCs (from a previous distributor), enter them manually in the metadata form

**UPC/EAN Barcode:**
• Required for albums and EPs (not single tracks)
• Auto-generated by Max Booster at no extra cost
• Tracks your release as a product across retail and digital stores

**Copyright:**
• Distributing through Max Booster does NOT affect your copyright — you retain 100% of your publishing and master rights
• The ℗ (phonogram) and © (copyright) year are set to your release year automatically`,
  },
  {
    keywords: ['cover art', 'artwork', 'album art', 'image requirements', 'art size', 'art specs'],
    category: 'distribution',
    answer: `Cover art requirements for music distribution:

**Required Specifications:**
• Size: **3000 × 3000 pixels minimum** (square format, 1:1 ratio)
• Format: JPG or PNG
• Color space: RGB (not CMYK)
• File size: Under 10MB
• Resolution: 72 DPI minimum (300 DPI recommended for print)

**Content Rules (platform requirements):**
• No explicit imagery on artwork (even if track is marked explicit)
• No third-party logos or watermarks
• No URLs or social media handles
• No misleading artist names or chart positions
• Text is allowed but should be readable at small sizes

**Tips:**
• Design at 3000×3000 for the best quality
• Test how it looks at 100×100 (thumbnail size on mobile)
• Use a clean, professional design — this is what fans see first`,
  },

  // ── ROYALTIES & PAYMENTS ──────────────────────────────────────────────────
  {
    keywords: ['royalties', 'royalty', 'payment', 'paid', 'when do i get paid', 'earnings', 'revenue', 'money', 'payout', 'income'],
    category: 'royalties',
    answer: `Royalties flow from streaming platforms to your Max Booster account to your bank:

**Payment Timeline:**
• Streaming platforms report and pay royalties 60–90 days after the month streams occur
• Max Booster processes your earnings once they are received
• Monthly payouts are processed on a rolling basis
• Minimum payout threshold: **$10 USD**

**You keep 100%** — Max Booster takes $0 commission on your streaming royalties.

**Tracking Your Earnings:**
1. Go to **Royalties** in the sidebar
2. See real-time breakdown by: platform, song, territory, and time period
3. Export detailed earnings reports (CSV or PDF)
4. Set up payment alerts when earnings reach a threshold

**Payout Methods:**
• Bank transfer (ACH/wire)
• PayPal
• Connect via Stripe Connect for direct deposit

Once you hit $10, payment is processed automatically on the next monthly cycle.`,
  },
  {
    keywords: ['royalty split', 'split royalties', 'collaborator', 'co-writer', 'featured artist', 'split payment', 'share revenue'],
    category: 'royalties',
    answer: `Royalty splits let you automatically share earnings with co-writers, producers, featured artists, and managers.

**How to Set Up Splits:**
1. Go to **Distribution → New Release** (or edit an existing release)
2. Click **"Royalty Splits"** section
3. Add collaborators by email address
4. Assign percentages (must total exactly 100%)
5. Collaborators receive an email invitation to accept their split
6. Once accepted, royalties are distributed automatically

**Features:**
• Unlimited collaborators per release
• Real-time earnings tracking for each party
• Each person has their own payout settings
• Change splits before release (locked after distribution goes live)
• Full payment history and statements per collaborator

**Publishing vs. Master splits:**
• Master (recording) splits are set in the distribution form
• Publishing (songwriting) splits are managed separately in your Royalties dashboard`,
  },
  {
    keywords: ['publishing', 'publishing rights', 'mechanical', 'performance rights', 'pro', 'ascap', 'bmi', 'songwriting royalties'],
    category: 'royalties',
    answer: `Publishing royalties are separate from streaming royalties — here's how both work:

**Streaming (Master) Royalties:**
• Paid by platforms for streams of your recording
• Collected and paid through Max Booster distribution
• You keep 100%

**Publishing (Songwriting) Royalties:**
• Paid for the underlying composition (melody + lyrics)
• Two types: Mechanical royalties + Performance royalties
• Collected by PROs (Performing Rights Organizations)

**PROs you can register with:**
• ASCAP, BMI, or SESAC (USA)
• SOCAN (Canada)
• PRS (UK)
• APRA AMCOS (Australia)

**Max Booster + Publishing:**
• Max Booster collects mechanical royalties through our distribution partners
• Register as a songwriter with a PRO for performance royalties (radio, TV, live)
• Our Royalties dashboard shows publishing earnings separately

**Tip:** Register every song you write with your PRO as soon as it's distributed — retroactive registration is possible but you may miss early earnings.`,
  },

  // ── MARKETPLACE ───────────────────────────────────────────────────────────
  {
    keywords: ['marketplace', 'sell beats', 'beat store', 'storefront', 'list beat', 'upload beat', 'beat marketplace', 'sell samples', 'sell loops', 'sell presets'],
    category: 'marketplace',
    answer: `The Max Booster Marketplace is your built-in beat store — like BeatStars, but with zero platform fees.

**Set Up Your Storefront:**
1. Go to **Marketplace** in the sidebar
2. Click **"Create Storefront"**
3. Customize: display name, logo, colors, banner image
4. Get your custom URL: \`yourname.maxbooster.app\`
5. Connect Stripe for payments (one-time setup)

**Uploading Products:**
1. Click **"Add Product"**
2. Upload your beat/sample/preset file
3. Upload a preview (watermarked MP3 recommended for beats)
4. Set pricing tiers:
   - **Basic Lease** – non-exclusive use (most affordable)
   - **Premium Lease** – more streams/downloads allowed
   - **Exclusive Rights** – buyer gets full ownership, removes from store
5. Attach your license terms
6. Publish

**What you can sell:**
• Beats (any genre)
• Sample packs
• Loop kits
• One-shots
• Presets (VST/plugin presets)
• Stems and track-outs

**You keep 100% of your sales revenue** (minus standard Stripe processing: ~2.9% + $0.30 per transaction).`,
  },
  {
    keywords: ['license', 'licensing', 'exclusive', 'non-exclusive', 'lease', 'exclusive rights', 'beat license', 'music license'],
    category: 'marketplace',
    answer: `Max Booster supports all standard music licensing tiers for the marketplace:

**License Types:**

**Non-Exclusive (Lease):**
• Buyer gets limited usage rights
• You can resell the same beat to multiple buyers
• Typically limited by stream count, distribution platforms, or term length
• Most common and affordable option

**Basic Lease** (example limits):
• Up to 100K streams
• 5,000 downloads
• Non-profit performances
• Must credit producer

**Premium Lease** (example limits):
• Up to 500K streams
• Unlimited downloads
• Monetized YouTube use
• Minimum producer credit

**Exclusive Rights:**
• Buyer receives sole ownership of the recording
• Beat is removed from your store after purchase
• You may keep publishing rights (configurable)
• Typically 10–100× the lease price

**Custom Licensing:**
• Set your own limits and terms per product
• Use the built-in license template editor in Marketplace settings
• All licenses are PDF-generated and emailed automatically after purchase`,
  },
  {
    keywords: ['marketplace fees', 'platform fee', 'commission', 'how much do i keep', 'revenue marketplace'],
    category: 'marketplace',
    answer: `Max Booster charges **zero platform fees** on marketplace sales — it's all included in your subscription.

**What you keep:**
• 100% of your sale price
• Minus standard Stripe payment processing: **2.9% + $0.30 per transaction**

**Example — selling a $50 beat:**
• Platform fee: $0
• Stripe processing: ~$1.75
• **Net to you: ~$48.25**

**Included in your Max Booster subscription:**
• Unlimited beat/sample listings
• Custom storefront with your domain
• PDF license generation
• Automatic buyer delivery
• Sales analytics and reports
• Stripe Connect payout integration

No monthly listing fees, no per-sale commissions, no feature unlocks — everything is in the base plan.`,
  },

  // ── SOCIAL MEDIA & AUTOPILOT ──────────────────────────────────────────────
  {
    keywords: ['social media', 'social', 'autopilot', 'auto post', 'automatic posting', 'instagram', 'twitter', 'tiktok', 'facebook', 'youtube', 'post automatically', 'social media autopilot'],
    category: 'social',
    answer: `The Social Media Autopilot runs 24/7 and manages your entire social presence using our in-house AI.

**What it does:**
• Automatically creates platform-optimized content from your music
• Posts on a smart schedule based on your audience's peak activity times
• Writes captions, hashtags, and calls to action for each platform
• Adapts tone and format per platform (Instagram carousel vs. Twitter thread vs. TikTok concept)

**Platforms supported:**
Instagram, Twitter/X, Facebook, YouTube, TikTok, LinkedIn

**Setting it up:**
1. Go to **Social Media** in the sidebar
2. Connect your accounts (OAuth — we never store your passwords)
3. Set your posting frequency (1–5 posts per day per platform)
4. Upload music or let the AI pull from your existing catalog
5. Turn on Autopilot — it handles everything from there

**AI content engine:**
• Uses genre, mood, BPM, and lyric context to write relevant captions
• Rotates content styles to avoid fatigue (promotional, storytelling, behind-the-scenes, fan engagement)
• Learns from your engagement data — content improves over time automatically`,
  },
  {
    keywords: ['connect account', 'connect instagram', 'connect twitter', 'connect tiktok', 'oauth', 'link account', 'social account'],
    category: 'social',
    answer: `Connecting your social media accounts to Max Booster:

**Steps:**
1. Go to **Settings → Social Media** (or the Social Media page → Accounts tab)
2. Click **"Connect"** next to each platform
3. You'll be redirected to the platform's official login page (OAuth)
4. Authorize Max Booster — we only get permission to post on your behalf
5. Return to Max Booster — your account is now linked

**What we access (and don't):**
• We CAN: create posts, upload media, read analytics
• We CANNOT: see your DMs, access your password, or see your followers' private data

**Supported platforms for direct connection:**
Instagram, Twitter/X, Facebook (Pages), YouTube, TikTok, LinkedIn

**Troubleshooting connection issues:**
• Make sure you're logged into the correct account in your browser before connecting
• For Instagram, you must connect via a Facebook Page (Instagram Business requirement)
• Revoke and reconnect if your token expires (tokens expire after 60–90 days depending on the platform)`,
  },
  {
    keywords: ['post schedule', 'when to post', 'best time', 'posting time', 'schedule post', 'optimal time'],
    category: 'social',
    answer: `Max Booster's AI calculates the optimal posting times for your specific audience — not generic averages.

**How the timing AI works:**
• Analyzes your historical post performance by hour and day
• Models your specific audience's timezone distribution
• Cross-references platform-wide peak hours for your genre
• Recommends a personalized schedule per platform

**General peak windows (starting points):**
• Instagram: Tue–Fri, 11am–1pm and 7pm–9pm (local time)
• TikTok: Tue, Thu, Fri, 7am–9am and 7pm–11pm
• Twitter/X: Mon–Wed, 9am–12pm
• YouTube: Thu–Sat, 2pm–4pm

**Customizing your schedule:**
1. Go to **Social Media → Schedule**
2. Enable "AI-Optimized Timing" for automatic best-time selection
3. Or set manual time slots if you prefer fixed windows
4. Set "Do Not Post" blackout periods (e.g., late night or holidays)

The system learns continuously — posting times auto-adjust as your audience grows and shifts.`,
  },

  // ── ADVERTISING AUTOPILOT ─────────────────────────────────────────────────
  {
    keywords: ['advertising', 'ad campaign', 'advertising autopilot', 'organic ads', 'zero cost', 'growth', 'promote music', 'marketing', 'ad spend', 'viral'],
    category: 'advertising',
    answer: `The Advertising Autopilot is Max Booster's zero-cost organic growth system — it replicates the results of paid ads using purely organic content strategy.

**How it works:**
• Our in-house AdvertisingAutopilotAI analyzes the platform algorithms (Instagram Explore, TikTok FYP, YouTube recommendations)
• It identifies the content patterns and sequences that trigger organic amplification — the same effects paid ads achieve
• Executes "burst sequencing": coordinated multi-platform posting that creates viral velocity
• Continuously A/B tests content styles and adapts to what performs

**What you get:**
• No ad spend required
• 24/7 automated content publishing
• Multi-platform viral optimization
• A/B testing of hooks, thumbnails, and captions
• Performance reports and attribution tracking

**Setup:**
1. Go to **Advertising** in the sidebar
2. Click **"Create Campaign"**
3. Choose campaign objective: Awareness, Engagement, Fan Growth, or Streams
4. Set your target audience (genre fans, location, demographics)
5. Activate — the AI handles all execution

Results typically begin showing within 72 hours of activation.`,
  },
  {
    keywords: ['ab test', 'a/b test', 'test content', 'which post performs', 'content test', 'split test'],
    category: 'advertising',
    answer: `A/B testing in the Advertising Autopilot lets you find what content drives the most growth for your specific audience.

**What gets tested automatically:**
• Hook text (first line of captions)
• Thumbnail / cover image variations
• Posting time slots
• Caption length (short punchy vs. long storytelling)
• Hashtag sets
• Call-to-action phrasing

**How it works:**
• The AI creates 2–4 variations of each content piece
• Each variation is posted across a test window (usually 48–72 hours)
• Engagement, reach, and stream conversion metrics are tracked per variant
• The winning variant becomes the template for future posts
• This process repeats continuously, so your content constantly improves

**Viewing results:**
Go to **Advertising → Campaigns → [Campaign Name] → A/B Results** to see a breakdown of each test and the winning variants.`,
  },

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  {
    keywords: ['analytics', 'stats', 'statistics', 'performance', 'streams', 'listeners', 'plays', 'views', 'data', 'insights', 'dashboard'],
    category: 'analytics',
    answer: `Max Booster Analytics gives you a complete view of your music career performance in one dashboard.

**What you can track:**
• **Streaming Data:** Total streams, monthly listeners, saves, playlist adds — per song and per platform
• **Revenue:** Earnings by platform, territory, and time period
• **Social Media:** Follower growth, post engagement, reach, impressions
• **Audience:** Demographics (age, gender, location), listening patterns
• **Marketplace:** Beat sales, most popular products, conversion rates

**Key reports available:**
• Release Performance (streams per day for each release)
• Revenue Breakdown (per platform, per territory)
• Audience Growth Timeline
• Top Performing Content (social posts and beats)
• Geographic Heat Map (where your listeners are)

**Data refresh rate:**
• Streaming data updates every 24 hours (platform reporting delay)
• Social media data updates every 2–4 hours
• Marketplace sales update in real time

**Exporting:**
Export any report as CSV or PDF from the Analytics page for use in presentations or business planning.`,
  },
  {
    keywords: ['spotify for artists', 'apple music for artists', 'platform dashboard', 'spotify data', 'claim profile'],
    category: 'analytics',
    answer: `In addition to Max Booster's built-in analytics, you should also claim your official artist profiles on the major platforms for additional data and control.

**Spotify for Artists:**
• Claim at: artists.spotify.com
• Access: detailed stream counts, listener demographics, playlist data, concert info
• Required: Your music must already be on Spotify via distribution

**Apple Music for Artists:**
• Claim at: artists.apple.com
• Access: plays, listeners, Shazam data, Siri requests, sales data

**YouTube Studio:**
• Access via your connected YouTube channel
• Track video views, watch time, subscriber growth, revenue

**Amazon Music for Artists:**
• Claim at: artists.amazon.com
• Access: streams, fan engagement, Alexa voice data

Max Booster aggregates data from all these sources into one dashboard so you don't have to check each separately. However, claiming your official profiles also gives you access to editorial playlist pitching and profile customization on each platform.`,
  },

  // ── CAREER TOOLS ──────────────────────────────────────────────────────────
  {
    keywords: ['career coach', 'career', 'career plan', 'career roadmap', 'grow career', 'music career', 'career advice'],
    category: 'career',
    answer: `The Max Booster Career Coach is a personalized AI-powered system that builds a strategic roadmap for your music career.

**What it does:**
• Analyzes your current metrics (streams, followers, releases, revenue)
• Benchmarks you against successful artists in your genre at similar stages
• Identifies your biggest growth opportunities and gaps
• Creates a 30/60/90-day action plan with specific, measurable tasks
• Tracks your progress and adjusts the plan as you hit milestones

**Career milestones tracked:**
• First 1,000 / 10,000 / 100K monthly listeners
• First sync licensing placement
• First editorial playlist feature
• First $1,000 / $10,000 in monthly royalties
• First 10K / 100K social followers

**How to access:**
Go to **Career Coach** in the sidebar → see your dashboard with current score, next recommended actions, and milestone progress.

The coach re-evaluates your strategy weekly based on new performance data.`,
  },
  {
    keywords: ['press kit', 'epk', 'electronic press kit', 'bio', 'artist bio', 'press'],
    category: 'career',
    answer: `Max Booster's Press Kit builder creates a professional EPK (Electronic Press Kit) for booking agents, labels, blogs, and media.

**Your EPK includes:**
• Artist bio (short and long form)
• High-resolution photos
• Featured releases with streaming links
• Key stats (monthly listeners, social following, streams)
• Embedded audio player
• Contact information and booking details
• Past press coverage and media mentions
• Tour dates (if applicable)

**Creating your EPK:**
1. Go to **Career → Press Kit**
2. Fill in your bio (or let the AI draft one from your profile data)
3. Upload press photos (min. 1500 × 1500 pixels, high-res)
4. Select featured releases
5. Publish — you get a shareable link at \`maxbooster.app/press/yourname\`

**Tips for a strong EPK:**
• Keep the bio to 150–200 words (third person)
• Use professional photos (studio or live performance)
• Feature your 3 strongest releases, not your entire catalog
• Include at least one external press mention if you have one
• Update it after every major milestone`,
  },
  {
    keywords: ['playlist', 'playlist pitching', 'editorial playlist', 'curator', 'submit to playlist', 'get on playlist', 'playlisted'],
    category: 'career',
    answer: `Getting on playlists is one of the fastest ways to grow your streams — Max Booster helps with both editorial and curator pitching.

**Editorial Playlists (Spotify, Apple Music, etc.):**
• These are curated by the platform's editorial team
• You must pitch at least 7 days before release date (Spotify requires this via Spotify for Artists)
• Max Booster distribution automatically includes your release in the editorial submission system
• Include a strong pitch note: genre, mood, key inspiration, what makes it unique

**Independent Curator Pitching:**
• Go to **Career → Playlist Pitching** in Max Booster
• Browse our database of 10,000+ independent playlist curators filtered by genre
• Send personalized pitches directly through the platform
• Track open rates and responses

**Playlist Pitching Tips:**
• Personalize every pitch — mention the playlist name and why your track fits
• Only pitch tracks that genuinely match the playlist's vibe
• Don't mass-pitch — curators blacklist artists who spam
• Follow up once after 2 weeks if no response, then move on
• Build relationships with curators over multiple releases`,
  },
  {
    keywords: ['sync', 'sync license', 'film sync', 'tv sync', 'sync placement', 'music for film', 'music for tv', 'commercial music', 'licensing music'],
    category: 'career',
    answer: `Sync licensing places your music in TV shows, films, ads, games, and YouTube videos — and can be one of the most lucrative revenue streams.

**How sync licensing works:**
• A music supervisor or content creator licenses your song for a specific use
• You receive a sync fee (upfront payment) plus backend performance royalties
• Sync fees range from $50 (small YouTube channel) to $50,000+ (major TV placement)

**Max Booster Sync Portal:**
1. Go to **Career → Sync Licensing**
2. Tag your music with mood, genre, instruments, tempo, and use-case keywords
3. Your music enters our sync catalog, searchable by supervisors
4. You get notified of licensing requests and can approve or negotiate terms

**Tips for sync-ready music:**
• Instrumentals and stems sell more often than vocal tracks
• Clear all samples before submitting (sampled music cannot be sync licensed)
• Ensure you own 100% of the master and publishing rights
• Keep the intro clean (no long intros — supervisors need impact fast)
• Register with a PRO (ASCAP, BMI) before any placement to collect performance royalties`,
  },

  // ── ACCOUNT & BILLING ─────────────────────────────────────────────────────
  {
    keywords: ['subscription', 'plan', 'pricing', 'how much', 'cost', 'billing', 'upgrade', 'downgrade', 'cancel subscription', 'free trial'],
    category: 'account',
    answer: `Max Booster offers an all-inclusive subscription — one plan, everything included, no feature paywalls.

**What's included:**
• Unlimited music distribution to 150+ platforms
• Beat marketplace with unlimited listings
• Full Studio DAW (unlimited projects)
• Social Media Autopilot (all platforms)
• Advertising Autopilot (all campaigns)
• AI mixing, mastering, and generation
• Analytics dashboard
• Career Coach
• Press Kit builder
• Playlist pitching
• Sync licensing portal
• Priority support

**No hidden fees:**
• No distribution fees
• No per-release charges
• No marketplace commission (just Stripe processing)
• No feature unlocks or add-ons

**Managing your subscription:**
Go to **Settings → Billing** to view your plan, update payment method, or manage your subscription.

For specific pricing, visit the Pricing page or contact our support team.`,
  },
  {
    keywords: ['password', 'reset password', 'forgot password', 'change password', 'login issue', 'cant login', 'locked out'],
    category: 'account',
    answer: `Help with password and login issues:

**Forgot your password:**
1. Go to the login page
2. Click **"Forgot Password"**
3. Enter your email address
4. Check your inbox for a reset link (check spam/junk if not in inbox within 5 minutes)
5. Click the link and create a new password
6. The link expires after 1 hour — request a new one if needed

**Changing your password (while logged in):**
1. Go to **Settings → Security**
2. Click **"Change Password"**
3. Enter your current password, then your new password
4. Save — you'll stay logged in on your current device

**Two-Factor Authentication (2FA):**
• Enable in **Settings → Security → Two-Factor Authentication**
• Use any TOTP app (Google Authenticator, Authy, 1Password)
• Store your backup codes somewhere safe

**Account locked:**
After multiple failed login attempts, your account temporarily locks for security. Wait 15 minutes or contact support to unlock immediately.`,
  },
  {
    keywords: ['delete account', 'close account', 'remove account', 'deactivate'],
    category: 'account',
    answer: `To delete your Max Booster account:

1. Go to **Settings → Account**
2. Scroll to the bottom and click **"Delete Account"**
3. Read the confirmation carefully — this action affects your releases and data
4. Confirm by typing your password
5. Your account enters a **30-day grace period**

**During the 30-day grace period:**
• Your account is deactivated but data is preserved
• You can cancel the deletion and reactivate at any time
• Your music remains live on streaming platforms during this period

**After 30 days:**
• All personal data is permanently deleted (GDPR Article 17 compliance)
• Your distributed music will be taken down from all platforms within 7 days
• Pending royalties will be paid out before deletion completes

**Important:** Before deleting, make sure to:
• Download all your projects from Studio
• Save your royalty reports
• Download any beats or files from the Marketplace
• Collect any pending earnings (must be above the $10 threshold)`,
  },
  {
    keywords: ['2fa', 'two factor', 'authenticator', 'mfa', 'security', 'two-factor authentication'],
    category: 'account',
    answer: `Two-factor authentication (2FA) adds a critical layer of security to your Max Booster account.

**Setting up 2FA:**
1. Go to **Settings → Security → Two-Factor Authentication**
2. Click **"Enable 2FA"**
3. Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
4. Enter the 6-digit code from your app to verify
5. Download and save your **backup codes** — store these somewhere safe (you'll need them if you lose your phone)

**How it works at login:**
• Enter your email and password as usual
• You're then prompted for your 6-digit authenticator code
• The code refreshes every 30 seconds

**If you lose access to your authenticator:**
• Use one of your saved backup codes
• Contact support with account verification details

**Strong password + 2FA** is the best protection for your account and your music earnings.`,
  },

  // ── MAX AI ASSISTANT ITSELF ────────────────────────────────────────────────
  {
    keywords: ['who are you', 'what are you', 'about max', 'about you', 'what is max', 'are you ai', 'are you a bot', 'are you real', 'how do you work'],
    category: 'assistant',
    answer: `I'm Max — the AI assistant built entirely in-house by the Max Booster team for B-Lawz Music.

**About me:**
• I'm powered by Max Booster's proprietary AI engine — custom-built, no external AI APIs
• I'm trained on every feature, workflow, and use case within the Max Booster platform
• I have full memory of our conversation — I remember what you've already asked me in this session
• I can answer questions about any part of the platform: Studio, distribution, royalties, marketplace, social media, advertising, analytics, and career tools

**What I can help with:**
• Step-by-step guidance on any feature
• Troubleshooting issues
• Strategy advice for growing your music career
• Understanding your analytics and royalty data
• Marketplace and licensing questions

**What I can't do:**
• Make account changes for you (those require you to act in the platform)
• Access real-time data from your specific account
• Connect to external services outside Max Booster

Is there a specific feature or question I can dive into for you?`,
  },
  {
    keywords: ['in-house ai', 'custom ai', 'ai technology', 'how is ai built', 'your ai', 'max booster ai', 'proprietary ai', 'ai model', 'trained ai'],
    category: 'assistant',
    answer: `Every AI feature in Max Booster — including me — is built and trained entirely in-house by the B-Lawz Music engineering team.

**Our In-House AI Stack:**

**Models & Training:**
• Custom transformer architecture optimized for music industry tasks
• In-house GPU training infrastructure with SIMD/Tensor Core acceleration
• Per-user model fine-tuning — your AI learns your specific audience and catalog
• Continuous retraining every 50 new data points (posts, streams, sales)
• No data shared with third-party AI providers — ever

**Specialized Engines:**
• **SocialMediaAutopilotAI** — predicts virality, engagement, and optimal posting timing
• **AdvertisingAutopilotAI v3** — organic amplification by modeling platform algorithms
• **AdvancedMusicAI** — deep music theory and audio analysis engine
• **AI Mixer/Mastering** — genre-aware deterministic audio processing
• **Max (me)** — comprehensive knowledge and conversational assistant

**Why in-house?**
• Your music, data, and strategies stay completely private
• We can tune models specifically for the music industry
• No dependency on external API availability or pricing
• Faster, more accurate responses for music-specific queries`,
  },

  // ── GENERAL ───────────────────────────────────────────────────────────────
  {
    keywords: ['help', 'support', 'contact support', 'contact us', 'human support', 'talk to person', 'escalate'],
    category: 'support',
    answer: `I'm here to help with any question about Max Booster! Here's how to get support:

**Ask me (Max):**
I can answer questions about any feature instantly — Studio, distribution, royalties, marketplace, social media, advertising, analytics, and career tools.

**In-App Support:**
• Go to **Support** in the sidebar
• Browse our help articles organized by category
• Submit a support ticket for issues I can't resolve

**Response times:**
• AI support (me): Instant, 24/7
• Ticket support: Within 24 hours (business days)
• Priority support: Within 4 hours (included in all plans)

**What to include in a support ticket:**
• Your username/email
• Description of the issue
• Steps to reproduce (if it's a bug)
• Screenshots or screen recording if possible

What can I help you with right now?`,
  },
  {
    keywords: ['mobile app', 'app', 'ios app', 'android app', 'download app', 'phone app', 'tablet'],
    category: 'general',
    answer: `Max Booster is available as a native mobile app for both iOS and Android, in addition to the web platform.

**iOS App:**
• Available on the App Store
• Full feature parity with the web platform
• Studio (with audio recording), distribution, analytics, and all career tools
• Optimized for iPhone and iPad

**Android App:**
• Available on the Google Play Store
• Full feature parity including Studio and recording
• Push notifications for royalty payouts, campaign performance alerts

**Desktop App:**
• Native desktop app for Windows, macOS, and Linux
• Runs the full Studio DAW with lower latency than the browser
• Available for download from your account settings

**Web Platform:**
• Works in any modern browser (Chrome, Safari, Firefox, Edge)
• No install required for casual use
• Full functionality including Studio

All your data syncs instantly across all devices — start a project on desktop, finish it on mobile.`,
  },
  {
    keywords: ['notification', 'alert', 'email notification', 'push notification', 'turn off notification'],
    category: 'general',
    answer: `Max Booster notifications keep you informed about important events across your music career.

**Types of notifications:**
• **Royalty alerts** — when earnings reach your payout threshold
• **Distribution updates** — when releases go live or are approved/rejected
• **Social media** — campaign performance summaries and engagement spikes
• **Marketplace** — new sales, license requests, and payout confirmations
• **Career milestones** — when you hit streaming or follower targets
• **Security** — new login detected from unrecognized device

**Managing notifications:**
1. Go to **Settings → Notifications**
2. Toggle each notification type on or off
3. Choose delivery method: in-app, email, push (mobile app), or all three
4. Set digest frequency: real-time, daily digest, or weekly summary

**Push notifications** require the mobile app to be installed and notifications permission to be granted in your device settings.`,
  },
  {
    keywords: ['gdpr', 'privacy', 'data', 'my data', 'delete data', 'data rights', 'privacy policy', 'personal data'],
    category: 'account',
    answer: `Max Booster is fully GDPR-compliant and respects your data rights.

**Your data rights:**
• **Right to Access** — Request a complete export of your data (Settings → Privacy → Export My Data)
• **Right to Erasure** — Delete your account to have all personal data permanently removed (30-day grace period)
• **Right to Rectification** — Update any incorrect personal information in Settings
• **Right to Portability** — Your data export includes all music files, project data, analytics, and royalty records

**What data we collect:**
• Account information (email, name, payment method)
• Usage analytics (features used, time spent)
• Music files you upload (stored securely, used only to provide the service)
• Social media performance data (from connected accounts)

**What we never do:**
• Sell your personal data to third parties
• Use your music to train AI without explicit consent
• Share your earning data with anyone
• Use your connected social accounts for anything other than posting your content

**Data storage:**
• Encrypted at rest and in transit
• US-based servers with EU data residency options available
• 90-day backup retention after deletion`,
  },
];

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
          score += 1;
        } else if (kwWords.some((w) => w.includes(token) && token.length >= 5 && w !== token)) {
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
    };
  }

  const scores = KNOWLEDGE_BASE.map((entry) => ({
    entry,
    score: scoreEntry(entry, tokens),
  }));

  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0];

  if (topScore.score >= 2) {
    return {
      content: topScore.entry.answer,
      category: topScore.entry.category,
      confidence: Math.min(topScore.score / 6, 1),
    };
  }

  const followUpCategory = detectFollowUpContext(userMessage, history);
  if (followUpCategory) {
    const categoryEntries = KNOWLEDGE_BASE.filter((e) => e.category === followUpCategory);
    if (categoryEntries.length > 0) {
      const entry = categoryEntries[Math.floor(Math.random() * categoryEntries.length)];
      return {
        content: entry.answer,
        category: entry.category,
        confidence: 0.5,
      };
    }
  }

  const isQuestion = FOLLOW_UP_PATTERNS.some((p) => p.isQuestion && p.pattern.test(userMessage));

  const fallbackTopics = `Here are the areas I can help you with:

• **Studio & DAW** — recording, mixing, mastering, AI generation
• **Distribution** — releasing to 150+ platforms, metadata, ISRC
• **Royalties & Payments** — earnings, payout schedule, splits
• **Beat Marketplace** — selling beats, licenses, storefront setup
• **Social Media Autopilot** — connecting accounts, scheduling, AI content
• **Advertising Autopilot** — zero-cost organic growth, A/B testing
• **Analytics** — streams, revenue, audience data
• **Career Tools** — career coach, press kit, playlist pitching, sync licensing
• **Account & Billing** — subscription, security, 2FA, privacy

What would you like to explore?`;

  return {
    content: isQuestion
      ? `Great question! I want to make sure I give you the most relevant answer.\n\n${fallbackTopics}`
      : fallbackTopics,
    category: 'general',
    confidence: 0.2,
  };
}

logger.info('[MaxAssistantService] In-house Max AI assistant knowledge engine initialized');
