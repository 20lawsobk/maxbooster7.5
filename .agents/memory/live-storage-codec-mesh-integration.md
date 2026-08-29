---
name: Live storage codec-mesh integration
description: How PocketDimension (live user storage) was wired to the codecMesh/PDCF engine instead of plain gzip, and why — distinct from the deploy-capsule codec choice (capsule-compression-codec-choice.md)
---

- `PocketDimension.compress()`/`decompress()` call `codecMesh` + `ContainerFormat` (encodeContainer/decodeContainer/isContainer) directly, bypassing `CompressionProfileRouter` (the fuller fabric pipeline used by the separate PocketStorageService/fabric stack) — the router adds cross-object delta/dedup semantics that are explicitly out of scope for this raw chunk layer.
- Backward compatibility needs no schema/version field: `decompress()` branches on `isContainer(data)` (PDCF magic bytes, "PDCF") vs the legacy path (gzip magic `0x1F 0x8B`) — old chunks keep reading forever with no migration step.
- `contentClass` passed to codecMesh is always `"unknown"` here — PocketDimension operates on raw chunks with no filename/MIME context at this layer. A caller with real content-type context would need to thread it through `write()` to get better codec selection than the default.
- Encryption order is unchanged (compress → encrypt on write; decrypt → decompress on read) — encryption wraps whatever `compress()` returns, so swapping the inner codec needed zero changes to the encryption path.
- No dictionary training (dictDomain) is wired in for this layer — kept the change minimal/scoped.

**Why:** the task's own out-of-scope list forbade adding delta/version semantics and forbade touching calling-service code; a narrow swap isolated inside compress()/decompress() satisfies both constraints while every real caller (storageService, hybridStorageService, modelWeightStorage, offlineModeService, ultra-quality-engine, pocket-storage-adapter, userPocketDimensionService, platform-capsule) benefits automatically since they only ever call `.write()`/`.read()`.

**How to apply:** if a future task wants dictionary training or per-content-type routing for live storage, add it at this same seam (PocketDimension's compress/decompress), still gated behind the PDCF magic-byte branch for backward compat with pre-existing gzip chunks.
