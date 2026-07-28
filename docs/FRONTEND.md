# Frontend Architecture

## Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 5 | Build tool + dev server |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4 | Utility-first styling |
| Wouter | | Client-side routing (lightweight React Router alternative) |
| TanStack Query | | Server state, caching, background sync |
| Zustand | | Global client state |
| Radix UI + ShadCN | | Accessible primitive components |
| Framer Motion | | Animations |
| Web Audio API | | Browser DAW audio engine |
| Capacitor | | iOS + Android wrapper |

---

## Directory Structure

```
client/src/
├── App.tsx              Entry point — Router, providers, lazy page loading
├── main.tsx             ReactDOM.createRoot, root providers
│
├── pages/               Route-level page components (lazy loaded)
│   ├── Dashboard.tsx    Career overview, stats, activity feed
│   ├── Studio.tsx       Browser DAW — tracks, mixer, piano roll
│   ├── Marketplace.tsx  Beat marketplace — browse, preview, buy
│   ├── Analytics.tsx    Streaming/revenue charts and dashboards
│   ├── Distribution.tsx DSP release management
│   ├── Social.tsx       Social media scheduling and autopilot
│   ├── Settings.tsx     Profile, security, preferences
│   ├── Billing.tsx      Subscription and invoices
│   ├── LandingPage.tsx  Public marketing homepage
│   ├── Storefront.tsx   Artist public storefront
│   └── admin/           Admin dashboards (security, KYC, system)
│
├── components/          Reusable components
│   ├── ui/              Primitive components (ShadCN pattern)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── card.tsx
│   │   ├── form.tsx     react-hook-form + Zod wrappers
│   │   ├── safe-img.tsx Fallback image (→ /placeholder.svg)
│   │   └── lazy-image.tsx IntersectionObserver-based lazy load
│   ├── layout/          App shell
│   │   ├── Sidebar.tsx  Navigation — adminOnly hides links (not a security gate)
│   │   ├── TopBar.tsx   Header with search, notifications, avatar
│   │   └── MobileBottomNav.tsx PWA mobile navigation
│   ├── studio/          DAW-specific components
│   │   ├── TrackList.tsx
│   │   ├── MixerPanel.tsx
│   │   ├── PianoRoll.tsx
│   │   └── PluginRack.tsx
│   ├── auth/            Auth flow components
│   │   ├── AuthProvider.tsx  Session state + auto-refresh
│   │   └── TokenRefreshHandler.tsx
│   └── [domain]/        Feature-specific component directories
│
├── hooks/               Custom React hooks
│   ├── useAuth.ts       Auth state, login/logout, role check
│   ├── useDAWCore.ts    DAW engine interface
│   ├── useKeyboardShortcuts.ts  Global + contextual shortcut binding
│   └── useUndo.ts       Undo/redo via UndoContext
│
├── lib/                 Non-React utilities
│   ├── api.ts           Fetch wrapper; relative URLs, credentials, CSRF header injection
│   ├── queryClient.ts   TanStack Query config (stale times, retry strategy)
│   ├── audioEngine.ts   Web Audio API graph, playback, recording
│   └── offline/         SW message passing, IndexedDB, sync queue
│
├── stores/              Zustand stores
│   ├── studioStore.ts   DAW state (tracks, clips, playhead, plugins)
│   └── unifiedStoreAdapter.ts  Cross-store sync adapter
│
├── contexts/            React context providers
│   ├── UndoContext.tsx  Global undo history stack
│   └── ThemeContext.tsx Dark/light mode + high-contrast
│
├── audio/               Low-level Web Audio
│   └── AudioEngine.ts   Web Audio API controller
│
├── types/               TypeScript ambient declarations
│   └── browser-extensions.d.ts
│
├── i18n/                Internationalization (i18next)
└── styles/              Global CSS + Tailwind base
```

---

## Routing

Wouter is used for client-side routing (lighter than React Router). Routes are defined in `App.tsx`:

```tsx
// All page components are lazy-loaded:
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Studio = lazy(() => import("./pages/Studio"));
// ...

<Router>
  <Route path="/" component={LandingPage} />
  <Route path="/dashboard" component={Dashboard} />
  <Route path="/studio" component={Studio} />
  <Route path="/marketplace" component={Marketplace} />
  <Route path="/admin/*" component={AdminLayout} />
  // ...
</Router>
```

**Admin route gating:** `App.tsx` does not role-gate routes at the router level. Each admin page component must call `useRequireAdmin()` at the top of its render function. `Sidebar adminOnly` only hides navigation links — it is not a security boundary.

---

## API Communication

`lib/api.ts` wraps all fetch calls:
- Always uses **relative URLs** (works in both Replit proxy and production).
- Includes `credentials: "include"` for session cookies.
- Automatically injects `X-CSRF-Token` header from the `csrf-token` cookie on all mutations.
- Returns a typed response or throws an `ApiError`.

TanStack Query manages all server state:
- Stale time varies by data type (user data: 30s, analytics: 5min, trending: 15min).
- Mutations call `queryClient.invalidateQueries()` after success.
- Failed queries retry up to 3 times with exponential backoff; 401/403 never retry.

---

## Global State (Zustand)

### `studioStore`
Tracks the full DAW session state:
- Active project, tracks, clips, playhead position.
- Plugin rack state (loaded VST/AU plugins).
- Undo history for studio actions.
- Mixer: volume/pan/effects per channel.

### `unifiedStoreAdapter`
Bridges Zustand and the DAW's internal audio engine. Ensures UI state and Web Audio graph stay in sync without manual imperative calls in components.

---

## Service Worker (PWA)

`client/public/sw.js` — v11

### Cache strategy by request type:

| Request type | Strategy | Cache name |
|---|---|---|
| Hashed JS/CSS assets (`/assets/*-[hash].js`) | Cache-first (immutable) | `max-booster-static-v11` |
| App shell / HTML navigation | Network-first → cache fallback | `max-booster-shell-v11` |
| API endpoints in allow-list | Network-first with TTL | `max-booster-api-v11` |
| Other API calls | Network-first → 503 JSON | `max-booster-dynamic-v11` |
| Images, fonts, icons | Cache-first | `max-booster-dynamic-v11` |
| Everything else | Stale-while-revalidate | `max-booster-dynamic-v11` |

**Dev mode bypass:** On `localhost`, `127.0.0.1`, and `*.replit.dev`, the SW is a complete pass-through — no caching, no stale HTML interference.

### Cache TTLs (API cache):
- `/api/analytics`: 15 minutes
- `/api/dashboard`: 5 minutes
- `/api/studio`: 30 minutes
- `/api/settings`: 60 minutes
- `/api/posts`: 10 minutes
- Default: 5 minutes

### Old cache cleanup:
On `activate`, all `max-booster-*` caches not matching current version names are deleted.

### Push notification security:
`sanitizeNotificationUrl(url)` validates all push-supplied URLs: resolved against origin, cross-origin URLs silently replaced with `/`. Prevents push-channel open-redirect attacks.

### Background sync:
POST to `/api/sync/batch` when offline → stored in `background-sync-queue` cache → replayed via `sync` event when connection returns.

---

## Audio Engine

`lib/audioEngine.ts` / `audio/AudioEngine.ts` — Web Audio API controller:

- **Track playback:** AudioBufferSourceNodes routed through gain and pan nodes to a master GainNode.
- **Recording:** MediaRecorder API; produces WebM blobs — served without `<source type="video/mp4">` to avoid MIME type rejection.
- **Effects chain:** ConvolverNode (reverb), BiquadFilterNode (EQ), DynamicsCompressorNode.
- **Plugin system:** Registered in `studioStore`; rendered in `PluginRack.tsx`. Built-in plugin parameters/presets bump `MANIFEST_REV` to force re-upsert.
- **WASM DSP:** Optional `audio-processor.js` AudioWorklet for high-performance processing.

---

## Offline Support

`lib/offline/`:
- **IndexedDB persistence:** Draft posts, unsaved studio changes, and background sync queue.
- **SW message passing:** Components post `PRECACHE_APP_CHUNKS` message after first hydration to pre-cache hashed assets for near-instant repeat visits.
- **Offline status:** Components can query SW for `{ cacheReady, pendingSync }` via `GET_OFFLINE_STATUS` message.

---

## Accessibility

- Radix UI primitives provide ARIA roles, keyboard navigation, and focus management throughout.
- `lib/accessibility.ts`: ARIA live region announcements, focus trap utilities, screen reader helpers.
- `useKeyboardShortcuts.ts`: global and contextual shortcut bindings; all customizable via `/api/shortcuts`.
- All interactive elements: minimum 44×44px touch targets on mobile.
- Images: `alt` required; decorative SVGs use `aria-hidden`.
- Focus rings: 2px brand-purple, 2px offset — never removed without a visible replacement.
- `ThemeContext`: high-contrast mode toggle in addition to dark/light.

---

## Component Library Mapping

| Design element | Implementation |
|---|---|
| Button | `components/ui/button.tsx` (Radix Slot + ShadCN) |
| Dialog/Modal | `components/ui/dialog.tsx` (Radix Dialog) |
| Form inputs | `components/ui/form.tsx` (react-hook-form + Zod) |
| Toast notifications | `components/ui/toaster.tsx` (Radix Toast) |
| Dropdown menus | ShadCN DropdownMenu (Radix) |
| Charts | Recharts with purple-gold gradients |
| Images | `safe-img.tsx` or `lazy-image.tsx` → fallback `/placeholder.svg` |

---

## Build & Dev

```bash
# Development (hot reload, no SW caching)
npm run dev

# Production build
npm run build

# Type check (client only)
npm run check:client
```

Vite config (`vite.config.ts`):
- `server.allowedHosts: true` — required for Replit's proxied iframe preview.
- Code splitting: vendor, React, studio, and page chunks are split separately.
- PWA plugin registers the service worker and generates the manifest links.
