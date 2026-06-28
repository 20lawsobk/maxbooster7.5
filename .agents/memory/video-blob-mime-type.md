---
name: Video blob MIME type mismatch
description: Why <source type="video/mp4"> breaks WebM blobs from MediaRecorder, and how to fix it
---

## The rule
Use `<video src={url}>` directly (no `<source>` child) when the URL may be a Canvas+MediaRecorder blob.

**Why:** `renderMaxcoreVideo` (Canvas+MediaRecorder) produces `video/webm;codecs=vp9` blobs. When a parent component renders `<video><source src={blobUrl} type="video/mp4" /></video>`, Chrome reads the declared `type` and, on mismatch with the actual blob Content-Type, silently rejects the source — the video element shows 0:00 with controls but never plays. Using `<video src={url}>` skips the source-selection MIME check; the browser reads the blob's own Content-Type instead.

**How to apply:** Wherever a video element may receive a blob URL (e.g., from `onVideoGenerated` callbacks in the social media page), use the `src` attribute directly on `<video>` rather than a `<source>` child. This is also safer for server MP4 URLs since the browser auto-detects the container format from bytes.

The two fixed locations in SocialMedia.tsx (the URL-generate tab video and the regular tab video) both had `<source type="video/mp4">` that broke WebM blobs from `ServerVideoGenerator`'s client-side canvas render path.
