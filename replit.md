# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an AI-powered platform designed to empower musicians, producers, and labels by streamlining music career management. It offers tools for music production, global distribution, social media management, a beat marketplace, and advanced analytics. The platform's core purpose is to provide a comprehensive, one-stop solution for artists to grow their careers and maximize market potential, from AI-assisted audio creation to detailed performance tracking.

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
Max Booster is built with a modern web stack, featuring a React 18 frontend with TypeScript, Vite, TailwindCSS, and shadcn/ui. The backend is an Express.js application written in TypeScript. Data persistence is handled by PostgreSQL with Drizzle ORM, and Redis Cloud is used for session management and distributed tasks.

### UI/UX Decisions
The frontend leverages shadcn/ui components for a modern and accessible user experience, focusing on intuitive workflows for music production, social media scheduling, and data visualization. The design incorporates concepts from professional DAWs like Studio One for features such as autoscroll modes, smart re-engagement, and "infinite" timeline bars, aiming for a clean, professional aesthetic.

### Responsive Layout System
The app uses a `ResponsiveLayout` component that automatically renders device-appropriate layouts:
- **Mobile**: Uses `MobileLayout` with bottom navigation, swipe gestures, and touch-optimized controls
- **Tablet**: Uses `TabletLayout` with split-pane layouts, multi-touch mixer, and floating action buttons
- **Desktop**: Uses standard `AppLayout` with sidebar navigation

Key responsive components:
- `client/src/components/layout/ResponsiveLayout.tsx` - Auto-switches between layouts
- `client/src/components/layout/MobileLayout.tsx` - Mobile wrapper with bottom nav
- `client/src/components/layout/TabletLayout.tsx` - Tablet wrapper with split panes
- `client/src/components/mobile/MobileDashboard.tsx` - Touch-optimized dashboard
- `client/src/components/mobile/MobileStudio.tsx` - Simplified mobile DAW
- `client/src/components/tablet/TabletDashboard.tsx` - Multi-column tablet dashboard
- `client/src/components/tablet/TabletStudio.tsx` - Side-by-side track/timeline view

### PWA Features
- Install banner with 7-day dismissal (`client/src/components/pwa/InstallBanner.tsx`)
- Deep linking via `web+maxbooster://` protocol (`client/src/lib/deepLinks.ts`)
- Service worker with caching strategies (`client/public/sw.js`)
- External link opener with URL sanitization (`client/src/lib/externalLinks.ts`)

### Technical Implementations
- **AI Studio**: Features real-time spectral editing, advanced modulation, analog warmth processing, real-time collaboration (Y.js), plugin hosting, professional DAW interface with advanced transport controls, mixer console, enhanced timeline, automation lanes, inspector panel, and browser panel. Includes Studio One-style autoscroll modes (Turn Over, Continuous Centered, Continuous Left) with smart re-engagement, adaptive grid snapping based on zoom level, event sync points (yellow diamond markers), and translucent waveform mode for grid alignment visualization.
- **Video Creation**: Utilizes an in-house WebGL render engine for custom video generation with shaders, audio visualizers, lyric engines, and text animators.
- **Distribution**: Integrates with LabelGrid for global music distribution, SLA tracking, Content ID registration, sync licensing, and automated royalty splits.
- **Social Media Management**: Provides approval workflows, bulk scheduling, unified inbox, competitor benchmarking, and social listening tools via OAuth connections.
- **Beat Marketplace**: Features license templates, customizable storefronts, advanced search, producer analytics, and zero-commission checkout via Stripe Connect.
- **Analytics Dashboard**: Offers multi-platform data ingestion (Spotify, Apple Music, YouTube, TikTok, Instagram), playlist tracking, trigger city detection, and cross-platform performance comparison.
- **Payment & Billing**: Implements Stripe Connect for split payments, instant payouts, automated PDF invoicing, and dispute handling.
- **User Retention**: Incorporates guided onboarding, progressive feature discovery, an achievement system, and an AI career coach.
- **Security Hardening**: Includes session fixation prevention, password change session invalidation, circuit breakers, webhook idempotency, rate limiting, token encryption, and input validation.
- **KYC/Identity Verification**: Provides an end-to-end workflow for users to submit identity documents and for admins to review and approve/reject verifications securely.

### System Design Choices
- **Microservices-oriented (conceptual)**: The backend is structured into distinct services to encapsulate business logic.
- **Robust Error Handling**: Utilizes try-catch wrappers, retries for external APIs, circuit breakers, and comprehensive validation.
- **Scalability**: Achieved through Redis for session/queue management, asynchronous operations, and memory safeguards.
- **Data Integrity**: Ensured by Drizzle ORM with strict schema validation and comprehensive input validation.

## External Dependencies
- **Stripe**: Payment processing, including Stripe Connect.
- **SendGrid**: Transactional email delivery.
- **Redis Cloud**: Session storage, caching, and distributed task management.
- **Sentry**: Error tracking and monitoring.
- **LabelGrid**: Music distribution, content ID, and sync licensing.
- **Replit Object Storage**: File asset storage.
- **Social Media APIs**: Integrations with Twitter, Facebook, Instagram, TikTok, YouTube, and LinkedIn.
- **music-metadata library**: Audio metadata extraction.
- **Y.js**: Real-time collaboration in the AI Studio.