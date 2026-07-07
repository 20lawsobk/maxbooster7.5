---
name: Video poster thumbnail (grey-placeholder-at-0:00)
description: Why a valid served MP4 still shows a grey box on mobile, and the server-poster + native-player fix
---

## The rule
A generated-video job MUST emit a real server-side `thumbnail_url` (an extracted first-frame JPEG), and the client MUST render it as a native `<video poster=...>`. A valid, correctly-served MP4 alone is NOT enough.

**Why:** Even a fully valid MP4 (H.264 Constrained Baseline / L4.0 / yuv420p / faststart, served HTTP 200 `video/mp4`) renders as a grey box at 0:00 on mobile browsers, because with `preload="metadata"` mobile Safari/Chrome do not decode and paint a first frame until the user taps play. Without a `poster` there is nothing to show. The earlier committed workaround appended a `#t=0.1` media fragment to the src to force a frame — iOS ignores media fragments on `<video>`, so it silently did nothing. The encode was never the problem; the missing poster was.

**How to apply:**
- Server: after final MP4 composition, extract one frame with ffmpeg (`-ss 0.1 -i <mp4> -frames:v 1 -q:v 3 <poster.jpg>`) into the same served dir, validate it is a real (>1KB) JPEG, and add `thumbnail_url` to the job result. Make it best-effort (try/catch → null on any failure) AND bound the subprocess with a kill-timeout (a hung ffmpeg must never stall job completion). Guard the URL→local-path mapping on the known served prefix (`/uploads/videos/`) before resolving into the ffmpeg input.
- Client: render generated clips through one reusable native `<VideoPlayer>` (native `<video>` with `poster`, `controls`, `muted`, `playsInline`, `preload="metadata"`; internal `onError` → honest fallback). Do NOT use `#t=0.1`. Do NOT use a `<source type="video/mp4">` child — see `video-blob-mime-type.md` (blob URLs may be WebM; a declared mime mismatch silently rejects the source). Thread the job's `thumbnail_url` into the player's `poster`.
- Only render the player where `src` is truthy (guard on the media URL) so `poster` decorates a real video.
