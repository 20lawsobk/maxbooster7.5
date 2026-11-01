---
name: MaxCore warm-up isolation
description: Keep infrastructure warm probes valid without weakening generation or awareness contracts.
---

Operational warm-up should not fabricate a user generation request. Select a prompt fully represented by the loaded checkpoint and run the real inference path with its existing unknown-token guard intact. A local per-step catch may not be the final error boundary: generation wrappers can re-promote failures recorded by guarded inference after the handler returns, turning a partial step into an HTTP error.

Background awareness warm-up runs outside request context. Obtain the authoritative current snapshot and bind it before reading awareness; if the snapshot is unavailable or invalid, preserve the failure rather than manufacturing context or claiming the subsystem is warm.

**Why:** Infrastructure probes need to prove the loaded model and subsystem are usable, while preserving the same fail-closed guarantees used for real requests. Synthetic prompts can be out of vocabulary, and daemon threads do not inherit a request-bound awareness snapshot.

**How to apply:** Keep warm-up input independent of caller text, verify it against the loaded tokenizer, and call real checkpoint inference. Do not clear recorded generation errors, relax the unknown-token threshold, invoke a template fallback, or synthesize an awareness snapshot. Bind only a snapshot returned by the awareness engine.