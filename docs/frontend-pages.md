# Frontend Pages

All pages are in `client/src/pages/`. The SPA is built with React 18, Vite, TanStack Query, and Tailwind CSS with shadcn/ui components.

## Core Platform Pages

### `Landing.tsx` — Public Marketing Page
The primary conversion page for new visitors.

**Sections**:
- Hero with value proposition and 90-day money-back guarantee
- Feature grid (AI Studio, Distribution, Marketplace, Analytics)
- Pricing tiers with plan comparison
- Social proof and trust signals
- Sticky CTA bar on scroll

**UX Patterns**: Scroll-triggered animations, risk reversal copy, high-contrast CTAs

---

### `Dashboard.tsx` — Artist Command Center
The logged-in home page. Adapts based on user experience level.

**Widgets**:
- **UserOverviewPanel** — Total tracks, revenue, reach at a glance
- **SmartNextActionWidget** — AI-driven "what to do next" recommendation
- **AICareerCoach** — Personalized career advice from in-house AI
- **ArtistProgressDashboard** — Career milestone progress
- **RevenueForecast** — 30/90-day earnings projection
- **SuggestedCollaborators** — AI-matched collaboration opportunities
- **CountdownCard** — Upcoming release countdowns
- **StreakCounter** — Daily usage streak gamification
- **AchievementNotification** — Badge unlock toasts

**Personalization System**:
- **QuickStartWizard** — Step-by-step setup for new users
- **SimplifiedDashboard** — Reduced-complexity view for beginners
- **FeatureDiscovery** — Progressive feature introduction
- **FeatureSpotlight** — Contextual feature highlighting
- **ContextualFeatureHint** — In-context tooltips as users explore
- **PowerFeatureSpotlight** — Surfaces advanced features to power users
- **FirstWeekSuccessPath** — Guided 7-day onboarding journey

---

### `Studio.tsx` — Digital Audio Workstation
Full-screen DAW with no layout padding to maximize working area.

**Layout**: Full viewport, no sidebar chrome. AppLayout renders the Studio with a special `noPadding` flag.

**Integration**:
- `StudioOneDAW` for the primary production interface
- Keyboard shortcut system active in studio context
- Auto-save every 30 seconds
- Recovery point creation before destructive operations

See `studio.md` for the complete DAW technical documentation.

---

### `Distribution.tsx` — Music Distribution (5,000+ lines)
The most complex page in the platform — a complete release workflow.

**Wizard Steps**:
1. **Release Basics** — Title, artist, release type (album/EP/single), language
2. **Track Upload** — Chunked audio upload with waveform preview
3. **Metadata** — Genre, ISRC, explicit content, iTunes pricing
4. **Platforms** — Select from 97+ DSP checkboxes (Spotify, Apple Music, etc.)
5. **Review & Submit** — Full metadata summary before submission

**Advanced Features**:
- Collaborator management with royalty split percentages
- Copyright owner and publishing rights fields
- UPC/ISRC code generation
- HyperFollow smart link builder
- Release scheduling with platform-specific cutoff warnings
- Pre-save campaign setup

**Technical Patterns**:
- Multi-step form state with `useState` + reset on completion
- Chunked file upload with progress tracking
- Platform selection grid with 97 checkboxes (grouped by category)
- Form validation per step before advancing

---

### `Marketplace.tsx` — Beat Marketplace
BeatStars-style platform with advanced purchasing flow.

**Features**:
- Waveform player (inline, non-blocking — keeps playing while browsing)
- Multi-tier licensing (Basic $29.99 → Exclusive $999.99)
- AI audio analysis for automatic metadata tagging
- Bulk upload for producers
- License agreement generation on purchase
- Escrow-based transaction safety
- Side-cart management

**Producer Tools**:
- Beat analytics (plays, likes, purchases, revenue)
- License template customization
- Bulk price updates

---

### `SocialMedia.tsx` — Multi-Platform Social Management
Unified social media hub with autopilot capability.

**Manual Management**:
- Unified inbox across all connected platforms
- Content calendar with drag-and-drop scheduling
- AI image generator (in-house)
- AI video generator (in-house)
- Post composer with platform-specific character limits

**Autopilot Mode**:
- When enabled, the UI switches from manual controls to a monitoring view
- Shows AI-generated and scheduled content queue
- Viral score displayed for each pending post
- Pause/resume individual posts

**Platform Connections**: OAuth flow for each platform (Instagram, TikTok, Twitter/X, YouTube, Facebook, Snapchat)

---

### `Advertisement.tsx` — AI Advertising Management (1,836 lines)
AI-driven campaign creation. No manual budget setting — the AI handles all allocation.

**Campaign Creation**:
- Campaign name
- Objective selection (streaming growth, social growth, event promotion, merch sales)
- Duration slider (1–30 days)
- Target audience platforms
- Age range sliders

**Advanced AI Features**:
- Audience segment discovery with ROAS prediction
- Lookalike audience modeling
- Creative fatigue detection
- Attribution dashboard
- Cross-channel attribution
- Creative variant A/B testing (auto-winner selection)

**`CrossChannelAttribution.tsx`**: Tracks which channels actually drove conversions — not just last-click, but full attribution paths

---

### `Analytics.tsx` — Platform Analytics Overview
Aggregated performance across all services.

**Data Sources**: Streaming, sales, social engagement, advertising, playlist positions

**Visualization**: Recharts-based charts, TanStack Query for real-time data polling

---

### `Projects.tsx` — Music Project Management
File and workflow management for music projects.

**Tabs**:
- **My Projects** — All projects with status indicators (Mixing, Mastering, Complete)
- **Songwriting** — Lyric writing and song structure tools

**Project States**: Status-coded badges (In Progress → Mixing → Mastering → Complete) with progress bars

**Features**:
- Cloud file management with folder organization
- Version history per project
- Workflow stage tracking
- Collaboration invites

---

### `Workspaces.tsx` — Team Collaboration
Multi-user organizational units for labels and teams.

**RBAC**: Role-based access control with custom role definitions
**Presence**: Real-time indicators showing who is currently active
**Activity Feed**: Chronological log of team actions
**Approval Workflows**: Formal request-response chains for publishing or spending

---

### `Onboarding.tsx` — Post-Registration Setup
Persona selection that customizes the entire platform experience:
- **Artist** — Performance-focused UI, touring/fan features prominent
- **Producer** — Marketplace and beat tools prominent
- **Label** — Team management and analytics prominent

---

### `ProducerProfilePage.tsx` — Public Producer Profile
Public-facing beat maker profile:
- Beat discography with waveform players
- Follow system
- Verification badges
- Sticky audio player (music keeps playing while browsing)
- Social proof (plays, followers, sales count)

---

### `RegisterPayment.tsx` — Subscription Registration
Step-through payment flow:
- Plan selection (Free, Standard, Pro, Label, Enterprise)
- Stripe payment integration
- Trial period display
- "Secure payment powered by Stripe" trust badge

---

## Analytics Sub-Pages (`pages/analytics/`)

### `AIDashboard.tsx` — AI Insights Hub
Centralized AI analytics with in-house prediction models:
- Churn prediction with risk factors
- Revenue forecasting (7/30/90-day + yearly)
- Anomaly detection with root cause analysis
- Confidence scores displayed on all forecasts
- Narrative insights with action recommendations

**Subtitle**: "Powered by AI Insights Engine — Predictive analytics and intelligent recommendations"

### `AudienceInsights.tsx`
Deep-dive demographic and behavioral analysis:
- Age/gender breakdowns
- Geographic heatmaps (city, country, region)
- Device distribution (mobile, desktop, tablet, smart speaker, TV)
- Source analysis (playlist, search, library, radio, artist)
- Listener behavior patterns

### `PlaylistTracking.tsx`
Monitors playlist placements across streaming platforms:
- Current playlist positions
- Historical position changes
- Revenue impact estimation per playlist
- Curator contact information

### `NaturalLanguageQuery.tsx`
AI-powered analytics chatbot:
- Users ask questions in plain English: "How much did I make in France last month?"
- In-house NLP interprets intent and generates the correct query
- Returns structured data visualization alongside the answer

### `CrossPlatformComparison.tsx`
Side-by-side performance benchmarking:
- Compare Spotify vs. Apple Music vs. YouTube streaming numbers
- Normalized metrics for fair comparison
- Revenue per stream comparison by platform

### `ExportAnalytics.tsx`
Custom report builder for labels and managers:
- Date range selector
- Metric selection
- Export formats: CSV, PDF, Excel

---

## Admin Pages (`pages/admin/`)

### `AdminDashboard.tsx` — Platform Control Center (1,500+ lines)
Traffic-light health indicators for all platform systems:
- System health overview
- User management (ban, verify, view sessions)
- Audit log viewer (filterable, searchable)
- Security dashboard (active threats, blocked IPs)
- Revenue and subscription KPIs

### `KYCReview.tsx`
Interface for manual identity verification:
- Document viewer
- Approve/reject with reason
- Escalation workflow

### `SecurityDashboard.tsx`
Real-time security monitoring:
- Active threat alerts
- Blocked IP list
- Session anomaly detection
- Self-healing engine action log

### `SupportDashboard.tsx`
Centralized customer support:
- Ticket queue with priority and status
- User account lookup
- Action tools (password reset, subscription override, account notes)
