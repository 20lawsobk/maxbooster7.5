# Too Lost migration verification

## Scope

This review verified the mounted new-release flow against Too Lost's public API
documentation without creating, submitting, deleting, or taking down a live
release.

## Official documentation

- [API overview](https://developer.toolost.com/docs/api)
- [Create release draft — `POST /releases`](https://developer.toolost.com/docs/api?url=#tag/releases/POST/releases)
- [Update release metadata — `PATCH /releases/{releaseId}/metadata`](https://developer.toolost.com/docs/api?url=#tag/releases/PATCH/releases/{releaseId}/metadata)
- [Update release delivery — `PATCH /releases/{releaseId}/delivery`](https://developer.toolost.com/docs/api?url=#tag/releases/PATCH/releases/{releaseId}/delivery)
- [Create track upload URL — `POST /releases/{releaseId}/tracks/upload-url`](https://developer.toolost.com/docs/api?url=#tag/release-tracks/POST/releases/{releaseId}/tracks/upload-url)
- [Replace release tracks — `PUT /releases/{releaseId}/tracks`](https://developer.toolost.com/docs/api?url=#tag/release-tracks/PUT/releases/{releaseId}/tracks)
- [Submit release — `POST /releases/{releaseId}/submit`](https://developer.toolost.com/docs/api?url=#tag/releases/POST/releases/{releaseId}/submit)
- [Delete draft release — `DELETE /releases/{releaseId}`](https://developer.toolost.com/docs/api?url=#tag/releases/DELETE/releases/{releaseId})

The documentation identifies `https://api.toolost.com/v1` as the production
API base. The DELETE operation is documented for draft releases only; it is not
treated as a live-release takedown contract.

## Verified request behavior

- Draft creation sends the documented release type and participant role array.
- Audio upload uses a `.flac` filename, `audio/flac`, and the documented
  presigned S3 PUT flow.
- Track replacement sends the documented audio file key, language, structured
  lyrics, primary artist, AI-assisted boolean, and an `instrumentalist` writer
  role. Too Lost documents `instrumentalist` as the currently accepted Composer
  role for DSP delivery.
- Metadata uses documented field names including `primaryGenre`, `coverUrl`,
  and `isAiGenerated`.
- Selected stores are resolved through the connected account's DSP catalog and
  sent in the documented delivery object. An unknown selection or failed
  delivery update blocks submission.
- Metadata and delivery update errors are fatal. The submit endpoint is not
  called after either update fails.
- Terms and rights values sent to the submit endpoint come from explicit user
  confirmations rather than defaults.
- Blank declarations may remain in a saved local draft, but all declarations,
  the Composer credit, terms acceptance, and rights confirmation are required
  before provider submission.
- Legacy LabelGrid status and takedown handling remain available for releases
  that already carry a LabelGrid release ID.

## AI-content limitation

The documented provider schema represents artwork AI generation and track AI
assistance as booleans, with related AI documentation fields on releases and
tracks. The current application does not collect and upload the provider
documentation file name/URL required to complete an AI-positive release.
Accordingly, truthful AI-positive declarations are preserved but provider
submission is blocked before any Too Lost draft is created. Completing
AI-positive submission still requires a secure document upload flow and mapping
to Too Lost's release `aiDocumentation` and track AI-assistance document fields.
The declaration must not be changed to a negative value as a workaround.

## Verification commands

- `NODE_OPTIONS=--max-old-space-size=4096 npm run check:server`
- `NODE_OPTIONS=--max-old-space-size=4096 npm run check:client`
- Focused Too Lost transport tests
- Focused ESLint, esbuild syntax transforms, and `git diff --check`

No live distribution request or live takedown request was performed.