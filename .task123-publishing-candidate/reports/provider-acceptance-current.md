# Provider acceptance evidence

This report separates shared-environment provider reads from credential-free
write-lifecycle simulations. It does not claim that a simulated provider write
was accepted by a real provider.

## Shared-environment read acceptance

The same configured Too Lost API environment is used by development and
deployment. It is selected by `TOOLOST_ENVIRONMENT`; Node's development or
production mode is not a second Too Lost account or launch gate.

- Stripe: the runtime live key was accepted by the official SDK for a read-only
  account retrieval. Account details were submitted, charges were enabled, and
  payouts were enabled.
- Stripe catalog: read-only listing returned 4 active products and 6 active
  prices with no additional page. Three active Max Booster prices covered the
  monthly, yearly, and lifetime tiers.
- Too Lost account: the existing unexpired shared-environment OAuth token was
  accepted by `GET /me`.
- Too Lost catalogs: the token was accepted for the platform lookup (479 active
  destinations) and releases listing (0 releases).
- Too Lost analytics: `GET /analytics/overview` was accepted.
- Too Lost sales: `GET /sales/overview` returned HTTP 403 with the provider
  message `Invalid scope(s) provided.` This is a real endpoint error, not proof
  that the account, client credentials, or all Too Lost reads are unavailable.
  The app currently has no caller for `getRoyaltySummary`, which is the only
  method using this endpoint.

No customer records, tokens, secret values, balances, or account identifiers
were printed. No provider write was made.

## Confirmed contract defects fixed

- OAuth scope construction requested undocumented `read:releases`. Too Lost's
  published scopes use `read:catalog` for releases. The authorization URL now
  requests only the published scopes the app uses: profile, catalog, analytics,
  earnings, and release write.
- Release listing sent `limit=200`, which the provider ignored. Read-only
  responses confirmed the contract is `page` plus `perPage`, with
  `currentPage`, `data`, `perPage`, `totalItems`, and `totalPages` in the
  response. The client now traverses every page and validates pagination
  metadata.
- OAuth callback selection previously used `NODE_ENV`/`REPLIT_DEPLOYMENT`,
  while every other Too Lost client setting used `TOOLOST_ENVIRONMENT`. With
  the shared sandbox-selected configuration, a deployment could therefore ask
  for an absent production callback variable. Callback selection now uses the
  provider environment consistently and fails with the exact missing variable.

## Simulated write-lifecycle acceptance

The isolated production-parameter simulation exercised the actual commerce
repository, engine, webhook receipt path, Too Lost submission orchestration,
restart behavior, and duplicate prevention against deterministic local
provider transports. It accepted exactly one simulated Stripe transfer, one
simulated payout, and one simulated Too Lost submission, with balanced journals
and durable duplicate suppression.

That simulation used no provider credentials and made no external provider
write. Real charge, refund, payout, release submission, and notification
acceptance remain untested by design.

## Remaining exact gaps

- The shared token's `/sales/overview` 403 remains real and isolated. Stored
  token-response scope metadata is empty, so it cannot establish which scope
  the provider actually granted. Do not infer a separate production account or
  prescribe reconnection from this evidence alone.
- `getRoyaltySummary` has no application caller, and its sales-overview response
  parser has not been accepted against a successful provider response. It must
  not be used for finance backfill or represented as verified royalty data.
- The connected account has no release, so the release-scoped sales endpoint
  used by `getReleaseAnalytics` could not be read-tested without fabricating an
  ID or creating provider data.
- Stripe webhook signature transport and all real financial/provider writes
  were intentionally not exercised.
- Runtime Stripe credentials are accepted, while Replit Secret metadata does
  not list the Stripe secret/webhook keys. This is a credential-custody
  observation for the existing migration owner, not evidence that the Stripe
  account is absent or unusable.

## Credential-gate clarification

The sanitized provider-gate evidence demonstrates only that Stripe credential
material is available to the server runtime while the checked key names are
absent from Replit Secret metadata. This review did not inspect `.replit` values
and did not find or display a literal credential in source or a shipped client
artifact. It therefore does not establish a new source/artifact exposure or a
provider-rotation launch prerequisite. It also does not waive the separately
tracked credential-custody work.

Concrete server controls visible in production code:

- A missing Stripe webhook secret returns an error before dispatch; a missing
  signature returns 400; signature construction failure returns 401.
- Stripe payment setup refuses to fabricate price IDs when its server key is
  missing or invalid.
- Too Lost API operations return an explicit not-connected/configuration error
  instead of substituting credentials or provider data.
- Client source and the checked built browser assets contain no references to
  the server credential variable names. This is a bounded symbol scan, not a
  test proving that every possible literal secret is absent.

Existing tests include HTTP cases for missing and invalid Stripe webhook
signatures. Those tests were inspected but were not run in this focused change,
so this report does not claim a fresh pass for them. The focused tests run for
the changed Too Lost scope, pagination, and environment-selection code passed
26 of 26.