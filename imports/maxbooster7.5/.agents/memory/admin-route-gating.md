---
name: Admin route-level gating
description: Every /admin* page must self-gate with useRequireAdmin because App.tsx does not role-gate routes
---

# Admin route-level access control

Routes in `client/src/App.tsx` are NOT role-gated globally — the `<Switch>` maps paths
straight to components with no per-route role guard. Authentication/role enforcement is
done _inside each page_ via hooks in `client/src/hooks/useRequireAuth.ts`.

**Rule:** every `/admin*` page must gate with `useRequireAdmin()`, never `useRequireAuth()`.

**Why:** `useRequireAuth` only requires a logged-in user, so a non-admin who knows the URL
can open an admin page directly. This actually happened — `AdminAutonomy` used
`useRequireAuth` while sibling admin pages used `useRequireAdmin`, leaving `/admin/autonomy`
reachable by any authenticated user. Sidebar `adminOnly` flags only hide the nav link; they
do nothing for direct URL navigation.

**How to apply:** when adding or auditing any admin page (those under `/admin` or
`client/src/pages/admin/`), confirm it calls `useRequireAdmin`. Sidebar nav visibility
(`adminOnly: true` in `Sidebar.tsx`) is a UX convenience, not a security boundary.
