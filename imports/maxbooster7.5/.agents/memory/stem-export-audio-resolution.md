---
name: Studio audio-clip schema drift hid behind @ts-nocheck; canonical resolver exists
description: A file-wide @ts-nocheck plus as-any/Record casts let a nonexistent `clip.filePath` field ship in three render functions; the correct shared resolver (audioSourceResolver.ts) already existed and should have been reused.
---

## What happened
`stemExportService.ts` carries `// @ts-nocheck` at the top and accesses
Drizzle query results through `Record<string, unknown>` / `as any` casts
throughout. This let three independent schema-drift bugs ship and stay live
simultaneously, none flagged by any static check:
1. An `.insert().values()` call omitted the real `name`/`format` columns
   (Drizzle silently used SQL defaults/NULL instead of erroring).
2. `renderSingleClip`, `mixAndRenderClips`, and `renderMasterBus` all read
   `clip.filePath` — a field that has never existed on the `audio_clips`
   table. The real column is `audioUrl`. Every one of these functions caught
   the resulting error/undefined internally and returned `null`/skipped, so
   the export still reported `status: "completed"` — just with silently
   missing or empty audio. This was the PRIMARY, most-common code path (any
   track with real recorded/uploaded audio), not an edge case — it had
   probably never worked for a real user.

## Why this stayed hidden
- `@ts-nocheck` disables all type checking for the file.
- `as any` / `Record<string, unknown>` casts on Drizzle rows defeat the type
  safety Drizzle would otherwise provide even without file-wide suppression.
- Every render function has a `try/catch` that logs a warning and returns
  `null` on failure — appropriate for a genuinely-unresolvable clip, but it
  also means a systematic bug (every row, always) looks identical to normal
  per-row degradation, and the outer job still completes "successfully".
- Only a live E2E test — upload a real audio file, run the real export,
  download the real ZIP, run `ffmpeg -af volumedetect` on the result to check
  for a real (non -90dB-floor) signal — actually proved the bug and then
  proved the fix. Code review and "it compiles" both missed it.

## The canonical fix already existed: audioSourceResolver.ts
`server/services/audioSourceResolver.ts` exports
`resolveAudioUrlToLocalFile(audioUrl): Promise<{localPath, cleanup}>` and was
already the shared, working resolver for every `audioUrl` shape used
elsewhere in the studio subsystem (e.g. `studioRenderService.ts`):
- `/api/storage/file/<encoded key>` (the app's own storage route — the
  current standard shape, produced by `storageService.getDownloadUrl()`)
- `/uploads/...`, `/samples/...`, `/attached_assets/...` (local static paths)
- `http(s)://` remote URLs
- a bare storage key (legacy rows that stored the raw key directly)

`stemExportService.ts` had three separate hand-rolled, broken copies of this
exact resolution logic, all keyed off the nonexistent `filePath` field and a
naive `startsWith("/")` heuristic that would have misfired on the real
`/api/storage/file/...` shape even after fixing just the field name (that
prefix starts with `/` too, so it would have been treated as a literal
non-existent disk path instead of an app route to resolve). Rewriting all
three to call the shared resolver fixed the bug in one place instead of
three.

## How to apply
- When a file mixes `@ts-nocheck`/heavy `any` casts with Drizzle query
  results, do not trust that "it compiles" or "the code path is covered by a
  try/catch" means the field names are correct — grep the actual `pgTable`
  schema definition for the real column list and diff it against every field
  access in the file.
- Before writing new resolution logic for a stored `audioUrl`/media
  reference anywhere in the studio subsystem, search for and reuse
  `resolveAudioUrlToLocalFile` rather than reinventing a per-call-site
  `startsWith`/`downloadFile` branch. Call the returned `cleanup()` in a
  `finally` block, not just after the success path.
- For audio/media rendering fixes, prefer live byte-level verification (file
  size match, volume/spectral analysis of the actual output via
  `ffmpeg -af volumedetect`) over trusting a "completed" status or a
  non-throwing return.
