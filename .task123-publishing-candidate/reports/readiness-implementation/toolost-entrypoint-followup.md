# Too Lost submission entrypoint follow-up

## Implemented

- Audited the three platform-specific new-submission routes (`spotify`, `apple`, and `youtube`) and confirmed they still built LabelGrid payloads and invoked `submitDistributionOnce("labelgrid", ...)`.
- Replaced those new-submission paths with the same real Too Lost choreography used by the main release submit route: connected-account lookup, live Too Lost platform-catalog resolution, the existing Too Lost release contract, and the Too Lost `createRelease` transport.
- Extracted that choreography into `distribution-toolost-submission.ts` and made the main release submission and all three platform entrypoints use it.
- Kept release ownership checks ahead of provider access. Kept explicit terms, rights, YouTube-rights, and AI declarations in the payload; missing declarations remain blocking rather than defaulted.
- Kept `submitDistributionOnce` as the serialization/checkpoint boundary, now consistently keyed as `toolost`. Existing LabelGrid submission rows and `labelGridReleaseId` metadata are not modified or deleted.
- Platform aliases are matched against Too Lost's live `id`, `slug`, or name using punctuation-insensitive comparison, then the provider's real platform name is sent.

## Evidence

- No platform-specific new-submission route invokes `submitDistributionOnce("labelgrid", ...)` or `labelGridService.createRelease`.
- Focused unit coverage verifies live-catalog alias mapping, the `toolost` idempotency key, rights/compliance propagation to the real client call, track mapping, and refusal to invent a missing AI declaration.

## Remaining provider requirements

- A usable user or authorized admin Too Lost OAuth connection is required.
- Too Lost's live platform catalog must contain the requested destination.
- The release still needs Too Lost's required metadata, explicit rights/terms declarations, non-AI compliance declarations, writer/composer data, artwork, and FLAC source audio. AI-assisted content remains blocked until the application collects Too Lost's required AI documentation fields/files.
- Historical LabelGrid records remain read-only/provider-specific data; this change does not migrate or delete them.