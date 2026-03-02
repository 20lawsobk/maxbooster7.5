# Frontend Components

All custom components live in `client/src/components/`. Over 200 components organized into 30+ domain directories. This document focuses on the most technically advanced implementations.

## Studio — DAW Components

See `studio.md` for comprehensive DAW documentation. Key highlights:

### `HighPerformanceDAW.tsx`
WebGL-accelerated DAW using Tone.js and PIXI.js. Implements a custom `useMasterClock` hook for sub-millisecond timing accuracy with drift compensation via `requestAnimationFrame`.

### `PixiWaveformRenderer.tsx`
PIXI.js (WebGL) waveform rendering engine:
- Hardware-accelerated rendering at 60fps with 100+ tracks
- Dynamic peak generation — downsamples audio data to display resolution
- Smooth zooming and panning without re-processing audio
- Draggable clip boundaries with magnetic snap-to-grid

### `RealTimeWaveformDisplay.tsx`
Dual-layer Canvas architecture:
- **Layer 1** (static): Rendered once, cached — the audio waveform itself
- **Layer 2** (dynamic): Repaints only for playhead position and hover effects
- Eliminates full-canvas redraws during playback

### `AIMusicGenerator.tsx`
Text-to-music generation interface:
- Parameters: genre, tempo, key, scale, mood, complexity
- Submits to in-house `/api/studio/generation/text` endpoint
- AI Copyright Notice displayed for every generation
- Generated tracks directly addable to the active project timeline

### `StudioOneDAW.tsx` (2,000+ lines)
Primary DAW interface. Multi-track timeline, inspector panel, mixer, AI panels, full keyboard shortcut system, project versioning, collaborative editing via Yjs.

### `UltimateDAW.tsx`
Five-mode production environment: Create, Record, Mix, Master, Perform. 3D Spatial Workspace for spatial audio. Spectral Visualizers. AI melody/drum/bass generation.

---

## Analytics & Data Visualization

### `DataDenseAnalytics.tsx`
The most data-dense component in the platform:
- **Recharts** for interactive charting
- **Framer Motion** for animated transitions
- Global streaming data table
- Revenue breakdown by source (streaming, sync, licensing, merch)
- "Trigger Cities" — AI-predicted breakout markets displayed on geographic data
- TanStack Query polling for live data updates without page refresh
- Custom loading skeletons during data fetches

---

## Advertising Components (`components/advertising/`)

### `CreativeAutomation.tsx` — AI A/B Testing
Fully automated creative testing system:
- Generates multiple AI content variants per campaign
- Tracks impressions, clicks, conversions per variant
- **Auto Winner Selection**: Determines statistical significance and automatically promotes the winning variant
- Configurable confidence threshold before declaring a winner

### `AttributionDashboard.tsx`
Multi-touch attribution modeling:
- Channel performance comparison
- Conversion path visualization
- Revenue attribution by channel and touchpoint

### `CrossChannelAttribution.tsx`
Full-funnel cross-platform attribution:
- Tracks user journey across TikTok → Instagram → Spotify → purchase
- Not last-click: distributed credit across all touchpoints
- Attribution window configuration

---

## Collaboration Components (`components/collaboration/`)

### `UserPresenceIndicator.tsx`
Real-time multi-user session awareness:
- Shows all users currently in the same project
- Status tracking: online, idle, typing
- Color-coded per-user indicators
- Raises "Presence Outcomes" to synchronize cursor positions across clients
- Handles WebSocket disconnect/reconnect gracefully

### `SuggestedCollaborators.tsx`
AI-powered collaborator matching:
- Skill complementarity matching (Producer ↔ Vocalist, Beatmaker ↔ Rapper)
- Genre alignment scoring
- Follower count similarity weighting
- Activity level filtering

### `CollaboratorCard.tsx`
Profile card for collaboration discovery with follow/connect actions.

---

## Undo & State Recovery (`components/undo/`)

### `UndoManager.tsx`
Multi-level undo/redo with action categorization:
- Categories: editing, settings, file operations
- Per-category undo history (can undo just file operations without touching edits)
- History panel showing all action history

### `RecoveryPointManager.tsx`
Auto-save and crash recovery:
- Creates recovery points before destructive operations
- Auto-saves to `localStorage` at configurable intervals
- Recovery UI allows traversal to any prior state
- Integrates with `useRecoveryPoints` hook

---

## Content Generation (`components/content/`)

### `AIImageGenerator.tsx`
In-house AI visual content generation:
- **Platform targets**: Instagram (1:1, 4:5), TikTok (9:16), YouTube (16:9)
- **Styles**: Cinematic, Neon, Luxury, Minimal, Urban, Fantasy
- **Output**: Direct image URL or Visual Spec (AI-generated prompt + color scheme)
- Supports multiple generations in a session
- Download button for each generated image
- Generated entirely by the in-house AI model

---

## Dashboard Components (`components/dashboard/`)

### `AICareerCoach.tsx`
In-house AI providing personalized career guidance:
- Analyzes streaming, sales, and social data
- Generates actionable next steps
- Surfaces opportunities (remix potential, sync opportunities, tour timing)

### `RevenueForecast.tsx`
30/90-day earnings projections:
- Powered by the `revenue_forecaster_v1` in-house model
- Confidence intervals displayed
- Breakdown by source (streaming, sales, sync, licensing)
- Trend comparison (vs. last 30/90 days)

### `ArtistProgressDashboard.tsx`
Career milestone tracking:
- Visual progress towards industry benchmarks
- Tier system (Emerging → Rising → Established → Star → Legend)
- XP-based gamification for platform engagement

### `SmartNextActionWidget.tsx`
The most important dashboard widget:
- Analyzes current account state
- AI determines the single highest-impact action right now
- Deep-links directly to the relevant page/section

---

## Notification System (`components/notifications/`)

### `NotificationCenter.tsx`
Full notification inbox:
- Grouped by type (releases, earnings, system, social)
- Mark-read / mark-all-read
- Rich content (embedded release artwork, revenue amounts)

### `NotificationBadge.tsx`
Real-time unread count badge:
- WebSocket-driven — updates without polling
- Zero count = badge hidden (no clutter)

### `NotificationToast.tsx`
In-context toast notifications for real-time events:
- Achievement unlocks
- Payout completed
- New collaboration request
- Release went live

---

## PWA Components (`components/pwa/`)

Full Progressive Web App support:
- Offline detection and graceful degradation
- Service Worker registration
- Install prompt management
- Offline content caching for studio projects
- `offline.html` served on network failure

---

## Accessibility (`components/a11y/`, `components/accessibility/`)

Production-grade accessibility implementation:

| Component | ARIA Pattern |
|---|---|
| `FocusTrap.tsx` | Traps keyboard focus within modals |
| `ScreenReaderAnnouncer.tsx` | ARIA live regions for dynamic content |
| `useRovingTabIndex` | Keyboard navigation in complex grids (Mixer, Plugin Browser) |
| `useFocusTrap` | Context-aware focus management |
| `useAccessibility` | Platform-wide accessibility state |
| `useAnnouncer` | Programmatic screen reader announcements |

All DAW interactions that are not naturally keyboard-accessible have ARIA announcements for screen reader users.

---

## Achievement & Gamification (`components/achievements/`)

### `AchievementBadge.tsx`
Visual badge display with:
- Animated unlock sequence
- Rarity tiers (Common, Rare, Epic, Legendary)
- XP reward display

### `StreakCounter.tsx`
Daily usage streak tracking:
- Current streak count with fire animation
- Longest streak record
- Streak milestone celebrations

---

## Layout & Shell (`components/layout/`)

### `AppLayout.tsx`
The main application shell:
- Sidebar navigation (collapsible on mobile)
- TopBar with user avatar, notifications, theme toggle
- MobileBottomNav for touch devices
- Breadcrumb navigation
- `noPadding` mode for Studio (full viewport)

### `Sidebar.tsx`
Collapsible navigation with:
- Grouped navigation items by category
- Active state highlighting
- Keyboard navigation
- Collapsed icon-only mode

---

## Video Components (`components/video/`)

Customization and preview tools for promotional video content:
- Video template selection
- Text overlay configuration
- Aspect ratio preview (TikTok, YouTube, Instagram)
- Export quality settings

---

## Command Palette (`components/commands/`)

Global command palette (⌘K / Ctrl+K):
- Fuzzy-search across all platform features
- Keyboard navigation
- Recent commands history
- Context-aware (shows relevant commands based on current page)

---

## Contracts & Legal (`components/contracts/`)

### Legal Document Builder
- Split sheet creation with multi-party signing
- Contract template selection
- E-signature capture
- Signature timeline visualization
- PDF export

---

## Auth & Security Components (`components/auth/`)

### `DeviceManagement.tsx`
Active session management:
- List of all logged-in devices
- Device type detection (browser, OS, IP)
- Per-device logout button
- "Log out all other devices" action

### Concurrent Session Alert
Warning when the same account is detected in multiple active sessions simultaneously.

---

## React Hooks (`client/src/hooks/`)

### Audio & DAW
| Hook | Technical Purpose |
|---|---|
| `useAudioEngine` | Web Audio API context management, Tone.js initialization |
| `useDAWCore` | Transport state, track CRUD, clip management |
| `useAudioRecorder` | `MediaRecorder` API with buffer accumulation |
| `useMultiTrackRecorder` | Parallel `MediaRecorder` instances per track |
| `useMetronome` | `AudioContext` oscillator scheduling with sub-sample timing |
| `useStudioScale` | Pixel-per-second and track height calculations for timeline |

### State & History
| Hook | Technical Purpose |
|---|---|
| `useUndo` | Immutable state stack with action metadata |
| `useGlobalUndo` | Cross-component shared undo history |
| `useUndoableAction` | Wraps any action with automatic undo registration |
| `useProjectSync` | Debounced auto-save with dirty-state detection |
| `useRecoveryPoints` | `localStorage` snapshots with timestamp indexing |
| `useDraft` | Optimistic UI for unsaved changes |

### AI & Intelligence
| Hook | Technical Purpose |
|---|---|
| `useAIWorkflow` | Orchestrates multi-step AI generation tasks |
| `useSmartDefaults` | Suggests starting parameters from genre/artist type |
| `useRecommendedActions` | Analyzes project state and surfaces next-best-action |

### Keyboard & Accessibility
| Hook | Technical Purpose |
|---|---|
| `useKeyboardShortcuts` | Global hotkey registry with conflict detection |
| `useShortcut` | Per-component shortcut registration |
| `useContextMenu` | Right-click menu positioning and lifecycle |
| `useRovingTabIndex` | ARIA grid keyboard navigation |
| `useFocusTrap` | Modal focus containment |

### Network & Offline
| Hook | Technical Purpose |
|---|---|
| `useOfflineStatus` | `navigator.onLine` + `online`/`offline` events |
| `useOfflineCache` | IndexedDB-backed local file cache |
| `useSyncQueue` | FIFO queue for actions performed offline, flushed on reconnect |
| `useWebSocket` | WebSocket connection lifecycle with auto-reconnect |

### Platform & Analytics
| Hook | Technical Purpose |
|---|---|
| `useAnalyticsInvalidation` | TanStack Query cache invalidation on distribution events |
| `useRequireAuth` | Redirects unauthenticated users to login |
| `useRequireSubscription` | Blocks access to gated features |
| `useFluidLayout` | Responsive layout breakpoint management |
| `useDynamicLayout` | Runtime layout adjustment based on content |
