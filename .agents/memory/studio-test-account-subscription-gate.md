---
name: Studio/Projects pages require an active or trialing subscription
description: client/src/pages/Projects.tsx (and likely other studio pages) call useRequireSubscription, which redirects any non-admin, non-demo user without subscriptionStatus active/trialing to /pricing
---

## Rule
`useRequireSubscription()` (client/src/hooks/useRequireAuth.ts) redirects to `/pricing` unless the logged-in user has `role === "admin"`, is the demo account (`email === "demo@maxbooster.ai"` or `isDemo` flag), or has `subscriptionStatus` of `"active"` or `"trialing"`. A freshly-registered plain test user has `subscriptionStatus: null` and will bounce off any page using this hook (confirmed: Projects list) before ever seeing the intended UI.

**Why:** a Playwright/E2E test that registers a throwaway user and navigates straight to a studio/DAW page will silently land on the pricing page instead, making a real bug look like "test setup issue" or vice versa.

**How to apply:** before UI-testing any studio/DAW page, either set the test user's `subscription_status` to `'trialing'` directly in the DB (fast, least-privilege, doesn't grant admin), or use `role: 'admin'` if admin-only behaviors also need checking. Do this for EVERY fresh test account created for studio-area testing, not just once.
