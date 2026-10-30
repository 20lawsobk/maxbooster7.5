---
name: Frontend content-generation UI testing
description: How to reach & test the live /social-media content-gen composer; auth path, the connected-platform gate, and which composer is dead code
---

# Testing the frontend content-generation flows (/social-media)

**Why:** the live UI has one usable composer, several dead-ends, and a hard
connected-platform gate. Multiple test runs failed on structural traps before this
was mapped. Backend gen endpoints were already verified separately.

## Auth path to reach generation
- `/social-media` uses `useRequireSubscription` → non-subscribed users bounce to
  `/pricing`. Admin(role) and demo(isDemo) bypass the subscription gate.
- **Demo Mode is a dead end for generation:** `nWrite` demo-write-protection
  (server/auth.ts, mounted `app.use("/api", ...)` in server/index.ts) blocks
  `POST /api/social/generate`. The demo account is read-only.
- **Working recipe:** register a real user (`POST /api/auth/register`, CSRF-exempt),
  then `UPDATE users SET subscription_status='active', subscription_tier='pro'`
  directly in NEON (bash has `NEON_DATABASE_URL`; `node -e` + pg, ssl
  `rejectUnauthorized:false`). The password is agent-chosen (not a secret) so it can
  be passed to a browser `runTest` for a real `/api/auth/login`.

## The connected-platform gate (the real blocker)
- The ONLY live composer is the page-level **"Create Post"** card in `SocialMedia.tsx`:
  `selectedPlatforms` (array, default `[]`), button **"Generate with AI"**
  (`handleGenerateContent` requires `selectedPlatforms.length > 0`).
- Platform toggles render ONLY for **connected** accounts
  (`platforms.filter(p => p.isConnected)`). No connection ⇒ "No platforms connected"
  empty state ⇒ generation is unreachable. Toggle testid = `create-platform-select-<id>`
  (e.g. `-meta`). These are NOT the OAuth "Connect" cards (those open external OAuth).
- `isConnected` for meta = an ACTIVE `social_accounts` row with platform
  `facebook`|`instagram` (route `/platform-status`). Generation only produces TEXT
  (doesn't post), so seeding an active row with a fake token unlocks the toggle. Set
  `metadata.lastSyncedAt = now` to skip the blocking pre-boot sync path.

## Dead code / traps
- The social `ContentGenerator.tsx` (single `selectedPlatform` dropdown default
  "instagram"; testids `textarea-post-content` / `button-generate-content`; a
  standalone optimize-hashtags control) is **imported nowhere** — do not target its
  testids. It has no connection requirement, which misleads you into thinking
  generation needs no platform.
- Hashtag "optimization" is NOT a separate button in the live UI — hashtags come
  bundled as chips inside generated output. The standalone optimize-hashtags
  endpoint/button lives only in the dead ContentGenerator.

## Two bugs found on the new-user path (both fixed)
- `/api/auth/demo` 500'd for everyone: demo email string LITERAL was
  `"demo@maxbooster?.ai"` — a `?.` codemod artifact baked INTO the string (same
  codemod-debris class as ts-error-cleanup, but inside a string literal). Lookup
  missed the seeded user → createUser → `users_username_unique` on "demo_user" → 500.
- `/social-media` crashed to the error boundary for new users:
  `useOnboardingProgress` returned `progress.completionPercentage`/`.totalPoints`
  WITHOUT optional chaining while the adjacent line used `progress?.completedAt`;
  `progress` is undefined until the query resolves (`?? 0` never helps — deref throws
  first). New-user/empty-data null-deref class again — see multimodal-text-null-derefs.
