---
name: Beat Money Loop output-quality findings
description: What audits of the loop's actual sellable output revealed — audio specs, dead files, degenerate trend scan, phantom ad posts
---

# Beat Money Loop output-quality findings (audited 2026-07-16)

- **Audio served under `/api/marketplace/audio/beats/...` depends on `storageService.fileExists`** — a missing `import fs from "fs"` made ALL beat audio 500 ("fs is not defined"). Fixed by adding the import. Any refactor of storageService must keep both `fs` (sync existsSync) and `fsPromises` imports.
- **Old beat audio dies silently**: PDIM eviction + (at the time) no surviving local write-through copy → listings stay `is_published=true` while their audio 404s. Listing rows are never validated against file existence. If re-audited: check every published listing's audio URL, don't trust `status=listed`.
- **MaxCore `/generate/audio` output is preview-grade**: 30 s, MONO, MP3 codec ~92 kbps inside a `.wav`-named file, true peak +0.3 dBTP (clipped), −17.3 LUFS. Not sellable as a lease/exclusive WAV. Duration is hardcoded `duration: 30` in `_maxcoreAudio`.
- **Trend scan is degenerate**: all cycles produce genre=indie, mood=empowering, tempo=150, confidence=1.0 → identical titles/keys/tags every cycle. IndustryFilter does surface other genres (latin, K-pop) and moods (driven), but `_distillScan` always takes element [0] / suggested hints, so the pick never varies; Exa+RSS sources fail (warn) yet confidence still reports 1.00.
- **MaxCore audio is deterministic for identical params**: two cycles 30 min apart returned byte-identical files (same md5). Same scan in → same beat out → the loop re-lists the SAME audio under new titles/dates. Diversity must come from varying the request (genre/mood/tempo/seed), not from MaxCore.
- **Ad post failures (retest 2026-07-16)**: instagram 400, tiktok 404, twitter 401 (media upload also fails) — OAuth/token/API issues per platform; AND `storage.createAdDeliveryLog` does not exist (TypeError swallowed in try/catch), so failures are never persisted anywhere.
- **Ad fan-out reports success while posting nothing**: "Campaign activated! Posted 0 times across 3 platforms" with 8 active social_accounts; 0 rows in `posts`; `ad_delivery_logs` table doesn't even exist (createAdDeliveryLog fails silently in try/catch). Same honesty bug class as autonomous-completed-honesty.md.

- **Full-length recalibration (2026-07-16)**: loop now requests `BEAT_DURATION_SECONDS` (default 180, clamp 60–600); initial-fetch timeout scales with duration (both modes may render sync), download timeout 120s, job-poll budget max(180s, 2s/sec). UNVALIDATED end-to-end: MaxCore went down (health 000, even d=30 hangs 240s) during testing, and its Mode C job failed server-side ("audio render failed" in their ffmpeg) on a d=180 job. Full-length may exceed MaxCore's real capability — verify with a direct `mode:"B", duration:180` probe when it's healthy before trusting the default.

**How to apply:** when judging this loop "working", require: servable audio (HTTP 200 + ffprobe sane), non-constant scan context across cycles, and ≥1 real row in `posts` per activated campaign.
