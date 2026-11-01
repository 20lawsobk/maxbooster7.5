---
name: Query cache persistence exclusions (PersistQueryClientProvider)
description: Why a query can show a stale value right when a component mounts/resumes, even though its mutation+invalidation logic is provably correct -- and the exclusion list that must be kept in sync.
---

## The mechanism

`client/src/main.tsx` wraps the whole app in `PersistQueryClientProvider` (`@tanstack/react-query-persist-client`), persisting the ENTIRE React Query cache to IndexedDB (via `idbPersister`) with `maxAge: 24h`. On every page load, any previously-cached query whose key isn't excluded gets rehydrated from IndexedDB and displayed immediately -- before any fresh network fetch resolves.

`shouldDehydrateQuery` only excludes keys containing a fixed set of substrings (payment/stripe/billing/contracts/invoices/presence/heartbeat/warp as of this writing). Any OTHER live, frequently-mutated, per-session query key (marker lists, comping takes, mixing/analysis snapshots, etc.) that isn't in that list is persisted and can replay a day-old value the instant a dialog/component mounts, independent of whether its own `useQuery`/`useMutation`/`invalidateQueries` code is correct.

Global defaults compound this: `staleTime: 5min`, `gcTime: 1h` (`client/src/lib/queryClient.ts`). A rehydrated entry can look "fresh enough" to skip an immediate background refetch depending on exactly when it was cached relative to mount.

**Why:** Diagnosed after a real bug where the Warp dialog's marker count showed "0 markers" on dialog resume/reopen despite the DB genuinely holding 18-25 real rows -- while direct curl testing proved the server, the bulk-insert route, AND the client's invalidate-on-mutation logic were all correct. The mutation/query code can read 100% correct in isolation; the actual bug is a cross-cutting concern that only manifests on reload/resume, not within a single continuous mount.

**How to apply:**
- When a query displays a wrong/stale value ONLY on first mount or after reopening/resuming (not after an in-session mutation, which self-corrects via `invalidateQueries`), suspect this persistence layer BEFORE assuming a race in the mutation/invalidation code itself. Confirm by checking whether the query key is excluded in `main.tsx`'s `shouldDehydrateQuery`.
- Any new `useQuery` you add for live, per-session editing/analysis state (not slow-changing catalog/settings data) must add its key substring to that exclusion list, or it inherits this bug class.
- This is orthogonal to (and was ruled out separately from) the server-side `apiCache.ts` response cache -- that one is keyed per-request on the server/PDIM side and was verified correct via direct GET/POST/GET curl reproduction; the persisted-client-cache issue is purely client-side IndexedDB rehydration.
