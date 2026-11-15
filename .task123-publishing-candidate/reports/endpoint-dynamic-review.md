# Dynamic frontend endpoint review

The dynamic-reference review is now generated as structured data by
`scripts/audit-endpoints.mjs` on every run instead of being maintained as a
line-number snapshot.

See:

- `reports/endpoint-audit.json` → `dynamicFrontendReview` for every computed
  call site, its finite source-traced contracts, static backend matches, and
  unresolved generic transports.
- `reports/endpoint-audit.md` → **Dynamic frontend reference coverage** for the
  human-readable matrix.

Current read-only live audit result:

- 12 computed call sites resolved to finite method/path contracts, all with
  static backend topology matches.
- 3 call sites remain intentionally unverified: the unused generic bulk helper
  and the two generic transport primitives in `queryClient.ts`.
- A topology match is not evidence that authentication, payloads, response
  envelopes, upstream services, persistence, or rendering function correctly.