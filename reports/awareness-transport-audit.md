# Awareness transport audit

## Authority applied

MaxCore remains the sole generation/conditioning authority. Application code now
preserves caller-supplied `intent`, `direction`, `context`, and `awareness`
without synthesizing replacement awareness at the transport boundary. The Max
platform-knowledge assistant was not changed.

## Applicability inventory

| Surface | Entry point / transport | Result |
|---|---|---|
| Direct MaxCore proxy | `server/routes/maxcoreProxy.ts` | Already preserved the complete JSON body; identity binding remains additive. Regression coverage extended. |
| Social URL generation | `POST /api/social/generate-from-url` → `socialUrlMaxCoreTransport` | Fixed schema/adapter drops; exact URL behavior retained and all four explicit conditioning fields reach `/api/platform/social/generate`. |
| Social image generation | `POST /api/social/generate-image` | Fixed explicit-field drops and removed app-generated awareness injection. |
| Social advanced generation | `advancedSocialAIService` → `maxcoreDomainAdapter` | Fixed context/direction/intent drops; removed automatic platform-awareness composition. Cache identity now includes explicit context and direction. |
| Multimodal | `POST /api/multimodal/generate` → analyze/text/image/audio/video workers | Fixed route and worker drops. The same explicit fields survive normalization and every applicable MaxCore generation submission, including async audio/video jobs. Removed local trend/platform awareness injection. |
| Advertising | `/api/advertising/generate-content`, `/generate-campaign`, `/generate-image`, `/generate-video`; ads domain adapters | Fixed all explicit-field drops. Removed `advertisingAIService`'s automatic awareness fetch; caller values are forwarded instead. |
| Social/ads autopilot | in-memory scheduled generation jobs and MaxCore social/ads autopilot adapters | Fixed config → job → generation → queued-content preservation. Adapter requests now preserve all explicit fields. Publish/performance context behavior remains unchanged. |
| Studio audio/pattern/video jobs | `/api/studio/generation/*`, `aiAudioGeneratorService`, `musicVideoStudioService`, video renderer | Fixed request-schema, async submission, style-transfer, pattern, and music-video handoff drops. Polling remains owner-bound and does not reconstruct generation intent. |
| Structured content pipeline | `contentTypeGenerators`, `unifiedAIController` | Fixed explicit-field forwarding and removed application-side awareness/industry fallback injection. |
| Max knowledge assistant | assistant routes/services | Exempt; unchanged. |
| Non-AI business/DSP/storage paths | unrelated endpoints | Not applicable; unchanged. |

## Endpoint contract changes for testing

The following authenticated POST endpoints now accept and preserve optional JSON
fields `intent`, `direction`, `context`, and `awareness`:

- `/api/social/generate-from-url`
- `/api/social/generate-image`
- `/api/multimodal/generate`
- `/api/advertising/generate-content`
- `/api/advertising/generate-campaign`
- `/api/advertising/generate-image`
- `/api/advertising/generate-video`
- `/api/studio/generation/text`
- `/api/studio/generation/pattern/melody`
- `/api/studio/generation/pattern/drums`
- `/api/studio/generation/pattern/chords`
- `/api/studio/generation/pattern/arrangement`

`/api/studio/generation/audio` accepts the same optional names as multipart
fields and carries them into the MaxCore style-transfer request. Existing direct
proxy generation endpoints preserve arbitrary JSON fields unchanged.

No response shape, authentication rule, entitlement rule, or polling URL was
changed.

## Verification

Sanitized, mocked unit contracts only; no database writes:

```text
6 test files passed, 34 tests passed
multimodal route, social URL transport, MaxCore domain adapter,
advanced social service, generic MaxCore proxy, advertising request builders
```

Advertising request-builder coverage verifies exact preservation for campaign
and image generation.