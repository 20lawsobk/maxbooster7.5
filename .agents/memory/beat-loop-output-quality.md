---
name: Beat Money Loop output-quality findings
description: What audits of the loop's actual sellable output revealed — audio specs, dead files, degenerate trend scan, phantom ad posts
---

# Beat Money Loop output-quality findings (audited 2026-07-16)

- **Audio served under `/api/marketplace/audio/beats/...` depends on `storageService.fileExists`** — a missing `import fs from "fs"` made ALL beat audio 500 ("fs is not defined"). Fixed by adding the import. Any refactor of storageService must keep both `fs` (sync existsSync) and `fsPromises` imports.
- **Old beat audio dies silently**: PDIM eviction + (at the time) no surviving local write-through copy → listings stay `is_published=true` while their audio 404s. Listing rows are never validated against file existence. If re-audited: check every published listing's audio URL, don't trust `status=listed`.
- **MaxCore `/generate/audio` output is preview-grade**: 30 s, MONO, MP3 codec ~92 kbps inside a `.wav`-named file, true peak +0.3 dBTP (clipped), −17.3 LUFS. Not sellable as a lease/exclusive WAV. Duration is hardcoded `duration: 30` in `_maxcoreAudio`.
- **Trend scan is degenerate**: all 9 cycles over 6 weeks produced genre=indie, mood=empowering, tempo=150, confidence=1.0 → identical titles/keys/tags every cycle. `_distillScan` falls through to static fallbacks/hints; upstream MusicIndustryContext appears constant.
- **Ad fan-out reports success while posting nothing**: "Campaign activated! Posted 0 times across 3 platforms" with 8 active social_accounts; 0 rows in `posts`; `ad_delivery_logs` table doesn't even exist (createAdDeliveryLog fails silently in try/catch). Same honesty bug class as autonomous-completed-honesty.md.

**How to apply:** when judging this loop "working", require: servable audio (HTTP 200 + ffprobe sane), non-constant scan context across cycles, and ≥1 real row in `posts` per activated campaign.
