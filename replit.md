# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered platform for musicians, producers, and labels, offering a comprehensive solution for music career management.

## Recent Changes (February 5, 2026)
Comprehensive outcome handling enhancements across all 14 major platform modules:
- **Settings/Security**: Added API key management, recovery codes, connected accounts management
- **Global Error Handling**: Network status detection, structured API errors, retry toasts, enhanced error boundaries
- **All Modules Enhanced**: Authentication, Billing, Distribution, Social Media, Marketplace, Analytics, AI Studio, Royalties, Workspaces, Contracts, KYC, Admin with complete outcome handling and user feedback

It integrates AI-assisted music production, global distribution, social media management, a beat marketplace, and advanced analytics. The platform aims to be a one-stop shop for artists to grow their careers and maximize market potential, from creative AI tools to performance tracking.

## User Preferences
I prefer clear and concise communication.
I value iterative development and frequent updates.
I like detailed explanations for complex features.
Do not make changes to folder `shared/`.
Do not make changes to file `shared/schema.ts`.
Prioritize robust, scalable, and secure solutions.
When making changes, always consider the impact on performance and user experience.
Always ask for confirmation before making significant architectural changes or adding new external dependencies.

## System Architecture
Max Booster employs a modern web stack: a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui, backed by an Express.js application in TypeScript. PostgreSQL with Drizzle ORM handles data persistence, and Redis Cloud is used for session management and distributed tasks.

### UI/UX Decisions
The frontend utilizes shadcn/ui for a modern and accessible experience, focusing on intuitive workflows for music production, social media scheduling, and data visualization. The design draws inspiration from professional DAWs like Studio One for features such as autoscroll modes and "infinite" timeline bars, emphasizing a clean and professional aesthetic. The platform features a dynamic layout system that auto-adjusts components for any screen size, using hooks like `useDynamicLayout` and `useFluidLayout`, and components like `DynamicGrid`, `DynamicFlex`, and `DynamicContainer` for responsive design.

### PWA Features
The platform supports Progressive Web App features, including an install banner, deep linking via `web+maxbooster://` protocol, a service worker for caching, and an external link opener with URL sanitization.

### Technical Implementations
- **Professional DAW Engine Architecture** (Studio One Paradigm): Complete 10-engine DAW core following professional DAW patterns. Located in `client/src/lib/daw/`:
  - **TransportEngine**: Sample-accurate timing with tempo maps, time signatures, pre-roll/count-in, latency compensation hooks
  - **TimelineEngine**: Musical time ↔ absolute time conversion, event quantization, 4 edit modes (slip/ripple/shuffle/spot)
  - **AutomationEngine**: Read/Write/Touch/Latch modes, bezier curve interpolation, point reduction, write buffering
  - **RoutingEngine**: Full routing graph with sends, buses, aux, sidechains, pre/post fader, cycle detection, latency compensation
  - **MIDIEngine**: Web MIDI API integration, quantization, humanize, velocity editing, legato, transposition
  - **NonDestructiveAudio**: Clip gain, fades (5 curve types), time-stretch/pitch metadata, split/consolidate
  - **PluginStateManager**: Per-plugin presets, automation bindings, copy/paste state, factory preset import
  - **MusicalIntelligence**: Key detection, chord suggestion, melody/bassline/drum generation, mix analysis
  - **ProjectManager**: Save/load, versions, autosave, crash recovery, media pool, missing file resolution
  - **DAWCore**: Central orchestrator with CommandSystem for undo/redo, integrates all engines
  - **useDAWCore hook**: React hook for UI integration with real-time position tracking
  - **DAWEngineControls**: Professional transport bar with tempo display, edit modes, automation modes
- **FlowState Studio** (Unified, Permanent Interface): Revolutionary next-gen DAW interface that combines all AI Studio features with innovative UX. FlowState is now the sole, permanent interface for the Studio - no classic mode toggle. Features include:
  - **3D Spatial Workspace**: Canvas-based 3D visualization with particle systems, track nodes in spatial 3D coordinates (pan=X, volume=Y, index=Z), multiple view modes (spatial/circular/grid), and auto-orbit camera.
  - **GPU-Accelerated Spectral Visualizer**: WebGL shader-based audio visualization with spectrum, waveform, and circular modes. Includes proper resource cleanup, context loss handling, and shader compile/link error checking.
  - **Adaptive UI Modes**: 5 context-aware modes (Create/Record/Mix/Master/Perform) with mode-specific toolbars and AI suggestions. Keyboard shortcuts 1-5 for quick mode switching.
  - **AI Co-Producer**: Context-aware AI suggestions panel with confidence scores, expandable suggestion cards, and mode-specific tips. Suggestions adapt to current workflow mode.
  - **Zero-Chrome Mode**: TAB key toggle for distraction-free editing with hidden chrome and floating transport overlay.
  - **Live Collaboration Presence**: WebSocket-ready presence system with user avatars, status indicators (active/idle/away), cursor tracking, track focus display, and recording status broadcast. Includes heartbeat, reconnection logic with exponential backoff.
  - **Smart Toolbar**: Selection-aware context toolbar showing relevant actions for tracks, clips, ranges, MIDI notes, or automation. AI-suggested actions highlighted.
  - **FlowStateAdapter Hook**: Bridge between studioStore and FlowState components with transport controls, track state, mixer bindings, and meter level updates via requestAnimationFrame.
  - **Plugin Browser & Instrument Dialogs**: Comprehensive plugin browser (Shift+P) for browsing and adding 13 built-in effects (EQ, Compressor, Reverb, Delay, Distortion, Chorus, Flanger, Phaser, Gate, Limiter, De-Esser, Vocoder, Dynamic EQ) and 10 digital instruments (Synthesizer, Sampler, Drum Machine, Piano, Organ, Bass, Strings, Brass, Pad, Lead). Each instrument type has dedicated control dialogs with parameter knobs, preset management, and bypass controls. Accessible via header button or track context menu.
  - **Professional Timeline Ruler**: Bar/beat/sub-beat grid with zoom controls (25%-400%), loop region markers, and animated playhead with glow effect.
  - **Track Creation Dialog**: Add Track button (⌘N) with 7 track types: Audio, Instrument, Vocal, Drums, Guitar, Bus, and Folder.
  - **Keyboard Shortcuts Overlay**: Press "?" to view all shortcuts organized into 7 categories (Transport, Editing, Tools, Modes, View, Tracks, Project).
  - **Context Menus**: Right-click context menus for tracks with standard DAW actions including duplicate, delete, mute, solo, rename, color, move, freeze, AI process, and add plugin.
- **Video Creation**: Utilizes an in-house WebGL render engine for custom video generation with shaders, audio visualizers, lyric engines, and text animators.
- **Distribution**: Integrates with LabelGrid for global music distribution, SLA tracking, Content ID registration, sync licensing, and automated royalty splits.
- **Social Media Management**: Provides approval workflows, bulk scheduling, unified inbox, competitor benchmarking, and social listening tools via OAuth connections.
- **Beat Marketplace**: Features license templates, customizable storefronts, advanced search, producer analytics, and zero-commission checkout.
- **Analytics Dashboard**: Offers multi-platform data ingestion (Spotify, Apple Music, YouTube, TikTok, Instagram), playlist tracking, trigger city detection, and cross-platform performance comparison.
- **Payment & Billing**: Implements Stripe Connect for split payments, instant payouts, automated PDF invoicing, and dispute handling.
- **User Retention**: Incorporates guided onboarding, progressive feature discovery, an achievement system, and an AI career coach.
- **Security Hardening**: Includes session fixation prevention, password change session invalidation, circuit breakers, webhook idempotency, rate limiting, token encryption, and input validation.
- **KYC/Identity Verification**: Provides an end-to-end workflow for identity document submission and admin review.
- **HyperLearning Engine**: An AI-powered learning system that analyzes social media performance, detecting micro-patterns, performing cross-platform synthesis, and offering predictive modeling for optimal content and timing.
- **Advanced AI Engines (GPT-5.2 Level)**: Custom-built, in-house AI engines for music generation and social media content creation. The **Advanced Music AI Engine** provides text-to-music generation with deep semantic understanding, music theory reasoning, and multi-dimensional synthesis. The **Advanced Social AI Engine** generates social media content with GPT-5.2 level understanding, platform-specific optimization, audience psychology modeling, viral pattern recognition, and A/B variant generation.

### System Design Choices
The backend is conceptually microservices-oriented. The system prioritizes robust error handling (try-catch, retries, circuit breakers, validation), scalability (Redis for session/queue management, asynchronous operations), and data integrity (Drizzle ORM, input validation).

## External Dependencies
- **Stripe**: Payment processing, including Stripe Connect.
- **SendGrid**: Transactional email delivery.
- **Redis Cloud**: Session storage, caching, and distributed task management.
- **Sentry**: Error tracking and monitoring.
- **LabelGrid**: Music distribution, content ID, and sync licensing.
- **Replit Object Storage**: File asset storage.
- **Meta Graph API**: Unified Facebook and Instagram integration via single Meta OAuth.
- **music-metadata library**: Audio metadata extraction.
- **Y.js**: Real-time collaboration in the AI Studio.
- **OAuth connections for Social Media Platforms**: Meta (Facebook + Instagram), Twitter/X, YouTube, Google, LinkedIn, Google Business. Threads and TikTok are planned for March 1st, 2026.