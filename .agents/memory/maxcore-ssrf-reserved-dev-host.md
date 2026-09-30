---
name: MaxCore URL guard and Replit dev hosts
description: Replit development URLs may be reachable from the workspace shell but rejected by MaxCore's server-side DNS-based SSRF guard.
---

Do not bypass MaxCore's SSRF protection just because a Replit development URL can be fetched from the workspace shell. The caller's resolver and MaxCore's resolver can see different addresses; URL generation must use a source that resolves to a public address from the server doing the fetch.

**Why:** On 2026-09-30, a supplied Replit development URL returned HTTP 200 when fetched from the workspace shell, while MaxCore classified its DNS result as a reserved address and rejected social and multimodal URL analysis. This was a safety block, not evidence that the SSRF guard should be weakened.

**How to apply:** For live URL-generation tests, distinguish source reachability from the workspace from reachability inside MaxCore. Preserve the guard, report its rejection, and request a publicly resolvable source URL rather than routing around it.