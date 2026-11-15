# Max Booster by B-Lawz Music - Design Guidelines

## Design Approach

**Reference-Based**: Professional DAW interfaces (Studio One 7, Ableton Live, FL Studio) merged with enterprise SaaS platforms (Linear, Notion, Stripe Dashboard). Dark-first design emphasizing precision, premium quality, and professional credibility for serious music industry users.

## Core Design Elements

### Spacing Scale

Canonical pixel scale (Tailwind unit in parentheses): **4 (1) · 8 (2) · 12 (3) · 16 (4) · 24 (6) · 32 (8)**, extending to 48 (12), 64 (16), 96 (24) for section rhythm. Never use arbitrary values between steps; if a layout needs an in-between value, the layout is wrong.

### Typography Scale (px)

| Token | Size | Usage |
|---|---|---|
| xs | 12px | Captions, timestamps, mono data labels |
| sm | 14px | Secondary body, table cells |
| base | 16px | Body copy |
| lg | 18px | Lead paragraphs |
| xl | 20px | Card titles |
| 2xl | 24px | Subsection headers |
| 3xl | 32px | Section headers (page-level h2) |

Hero/display sizes (5xl–7xl) sit above this scale and are reserved for marketing surfaces only.

### Typography

- **Primary Font**: Inter (700 for headings, 600 for subheadings, 400/500 for body)
- **Accent Font**: JetBrains Mono (technical labels, DSP counts, analytics data)
- **Scale**: Hero (5xl-7xl), Section Headers (3xl-5xl), Cards (xl-2xl), Body (base-lg), Captions (sm-base)

### Layout System

**Spacing Primitives**: Tailwind units of 4, 6, 8, 12, 16, 24

- Component padding: p-6 to p-12
- Section spacing: py-20 to py-32
- Container: max-w-7xl with px-6
- Grid gaps: gap-6 to gap-8

### Color Strategy (Structure Only)

- **Foundation**: Deep navy/midnight blues (multiple depths for layering)
- **Accents**: Rich purples (secondary actions, highlights), Gold/Amber (premium features, CTAs, success states)
- **Application**: Gold for primary CTAs and premium badges, Purple for interactive states and data viz, maintain dark background hierarchy throughout

### Motion Guidelines (Framer Motion)

- **Durations:** micro-interactions 120–180ms, component transitions 200–300ms, page/section entrances 300–450ms. Nothing over 500ms.
- **Easing:** `easeOut` for entrances, `easeInOut` for state changes; springs only for playful marketplace elements (`stiffness: 300, damping: 25`).
- **Stagger:** feature/card grids stagger children at 60–80ms.
- **Respect `prefers-reduced-motion`:** wrap non-essential animation in `useReducedMotion()`; scroll-triggered fades degrade to instant visibility.
- Never animate layout-affecting properties on scroll (use `transform`/`opacity` only).

### Accessibility Rules

- **Contrast:** body text ≥ 4.5:1 against its background; large text and UI glyphs ≥ 3:1. Gold-on-dark CTAs must use the darkened gold text variant, not pure amber.
- **Focus states:** every interactive element gets a visible focus ring (2px, brand purple, 2px offset). Never `outline: none` without a replacement.
- **Targets:** minimum 44×44px touch targets on mobile surfaces.
- **Semantics:** Radix primitives supply ARIA; don't rebuild dialogs/menus by hand. Images require `alt`; decorative SVGs get `aria-hidden`.
- **Motion & audio:** honor `prefers-reduced-motion`; no auto-playing audio anywhere.

### Component Library Mapping

| Design element | Implementation |
|---|---|
| Button | Radix Slot + ShadCN `button.tsx` variants (gold = `default`, purple = `secondary`) |
| Dialog/Modal | Radix Dialog via ShadCN `dialog.tsx` |
| Dropdown/Menu | Radix DropdownMenu via ShadCN |
| Toast | ShadCN `toaster` (Radix Toast) |
| Forms | react-hook-form + Zod + ShadCN `form.tsx` |
| Charts | Recharts with purple-gold gradient tokens |
| Images w/ fallback | `safe-img.tsx` / `lazy-image.tsx` (fall back to `/placeholder.svg`) |

## Component Library

### Navigation

Fixed header with glass morphism effect, B-Lawz Music logo left, centered navigation (Platform, Features, Marketplace, Pricing), right-aligned CTA button + user avatar. Gold underline indicator for active items.

### Hero Section

Full-viewport hero with professional studio environment image (producer at multi-monitor DAW setup with hardware). Dark gradient overlay ensuring text contrast. Centered content: B-Lawz Music badge, powerful headline emphasizing AI-powered career management, supporting copy highlighting key value props, dual CTA buttons (primary gold, secondary outlined), floating stats ribbon below: "34+ DSPs • 8 Social Platforms • AI-Powered Distribution • Real-time Analytics"

### Platform Features Showcase

**3-column grid** presenting core capabilities:

1. **AI Distribution Hub**: Interface preview with DSP logos, upload progress bars, smart release scheduling
2. **Professional DAW Studio**: Browser-based DAW showing waveforms, mixing console, plugin racks
3. **Beat Marketplace**: Trading interface with beat cards, waveforms, pricing tiers
4. **Social Command Center**: Multi-platform dashboard (IG, TikTok, YouTube) with scheduling grid
5. **Analytics Intelligence**: Dashboard with streaming graphs, revenue charts, audience demographics
6. **AI Creation Tools**: AI-assisted mixing, mastering, cover art generation previews

Each card: Feature image/graphic, bold title, 3-line description, gold accent border on hover, "Learn More" link

### Enterprise Trust Section

2-column layout: Left side displays major DSP/platform partner logos (Spotify, Apple Music, YouTube, TikTok, Instagram) in organized grid. Right side features enterprise-level credibility indicators: uptime guarantee, security certifications, support SLA, client testimonials from known artists.

### Analytics Dashboard Preview

Full-width interactive showcase displaying mock analytics interface: revenue tracking graphs, streaming performance charts, social engagement metrics, geographic heat maps, trend predictions. Demonstrates platform's data visualization capabilities with purple-gold gradients.

### Pricing Tiers

3-column comparison table (Creator, Pro, Enterprise):

- Clear tier headers with gold highlights on "Pro" (most popular)
- Feature lists with gold checkmarks
- Monthly/Annual toggle
- Tiered pricing display
- Gold CTA buttons
- Enterprise tier includes "Contact Sales"

### Social Proof Wall

4-column testimonial grid featuring:

- Artist profile images
- Quote snippets
- Streaming stats (millions of plays)
- Platform verification badges
- Gold quotation accent marks

### Footer

Comprehensive 4-column layout:

- Column 1: B-Lawz Music branding, mission statement, newsletter signup (gold button)
- Column 2: Product links (Features, Pricing, Integrations, API)
- Column 3: Resources (Docs, Tutorials, Community, Blog)
- Column 4: Company (About, Careers, Press, Contact)
  Bottom bar: Copyright, legal links, social icons (gold hover), trust badges (SSL, GDPR compliant)

## Images

### Hero Image

High-resolution photo of professional music producer in modern studio with multiple curved monitors displaying DAW interface, MIDI keyboard controller, studio monitors, acoustic treatment visible. Moody cinematic lighting with subtle purple-blue ambient glow. Conveys premium, professional-grade environment.

### Feature Section Images

1. **Distribution Interface**: Clean dashboard showing multi-DSP upload flow, release calendar, analytics preview
2. **DAW Workspace**: Professional mixing console view with colorful waveforms, multiple track lanes, plugin interface
3. **Beat Marketplace**: Grid of beat cards with animated waveforms, genre tags, price displays, creator profiles
4. **Social Dashboard**: Multi-window interface showing scheduled posts across platforms with engagement metrics
5. **Analytics Screen**: Graphs and charts displaying streaming data, revenue trends, audience insights with purple-gold gradients
6. **AI Tools**: Split-screen showing before/after of AI mastering, cover art generation examples

### Testimonial Images

3-4 professional headshots of diverse independent artists/producers in studio settings or performance contexts.

## Special Elements

**Waveform Decorations**: Subtle waveform patterns as section dividers and card background accents
**Premium Badges**: Gold "PRO" and "AI-Powered" labels on advanced features
**Glass Panels**: Frosted glass effect for floating components over dark backgrounds
**Glow Effects**: Soft gold glows on primary CTAs and premium feature indicators, purple glows on hover states
**Progress Indicators**: Gold-purple gradient progress bars for uploads, processing states
**Data Visualization**: Charts and graphs using purple-gold color schemes for professional analytics display

## Animations

Purposeful and subtle:

- Fade-in on scroll for feature cards (stagger effect)
- Gentle pulse on primary CTAs
- Waveform subtle movement in hero background
- Smooth hover state transitions on cards
- No auto-playing media or excessive motion
