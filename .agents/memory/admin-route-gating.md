---
name: Admin route-level gating
description: Every /admin* page must self-gate with useRequireAdmin because App.tsx does not role-gate routes
---

# Admin route-level access control

Private-launch restrictions are not a substitute for per-page administrator
authorization after public launch. Keep each administrator page independently
role-gated even when the whole application currently defaults to private access.

**Rule:** every `/admin*` page must gate with `useRequireAdmin()`, never `useRequireAuth()`.

**Why:** `useRequireAuth` only requires a logged-in user, so a non-admin who knows the URL
can open an admin page directly. This actually happened — `AdminAutonomy` used
`useRequireAuth` while sibling admin pages used `useRequireAdmin`, leaving `/admin/autonomy`
reachable by any authenticated user. Sidebar `adminOnly` flags only hide the nav link; they
do nothing for direct URL navigation.

**How to apply:** when adding or auditing any admin page (those under `/admin` or
`client/src/pages/admin/`), confirm it calls `useRequireAdmin`. Sidebar nav visibility
(`adminOnly: true` in `Sidebar.tsx`) is a UX convenience, not a security boundary.
