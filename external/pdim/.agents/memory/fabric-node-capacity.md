---
name: Fabric provisioned capacity & node sizing
description: How the storage fabric's advertised capacity is set, and the restart gotcha for the dataset download queue.
---

# Fabric provisioned capacity

Provisioned capacity reported by `/api/fabric/capacity` is **software-defined**:
`sum(node.capacityBytes)` over registered `pocket-dimension` nodes. It is an
advertised target, NOT physical disk — real bytes still land on the single
workspace volume. To raise the target, increase per-node capacity (or node
count), not the disk.

**Per-node capacity is defined in THREE code spots — keep them in lockstep:**
1. `AutoClusterManager` `DEFAULT_RULES.capacityBytesPerNode`
2. the `autoClusterManager` rules override in fabric `index.ts`
3. the seed-node `registerNode({ capacityBytes })` call in fabric `index.ts`

**Code changes alone do NOT resize already-seeded nodes.** Existing rows in the
`fabric_storage_nodes` table keep their old `capacity_bytes`; you must `UPDATE`
them too. The `/capacity` endpoint reads the registry from the DB on each call,
so a DB update is reflected without a restart.

**Why:** seed nodes are created once on first boot and persisted; the seed code
path is skipped when `pdNodes.length >= SEED_CLUSTER_SIZE`.

# Dataset download queue recovery on restart

`DatasetDownloadService` keeps its work queue in process memory, but persists
intent in the DB (`discovered_datasets.is_queued = true`, `dataset_downloads`
rows with status `pending`/`downloading`). Restart loses the in-memory list.

**This now self-heals on boot:** `recoverPendingDownloads()` (called from the
server startup state-services path) resets stuck `downloading → pending` and
re-enqueues all `pending` rows automatically. Do NOT manually mark rows `error`
or clear `is_queued` after a restart — that fights the recovery.

**Why:** orphaning the queue on every restart was a durability bottleneck; the
recovery makes in-flight downloads survive restarts without operator action.

**Crash caveat:** the download fetch follows redirects. A relative `Location`
header must be resolved against the current URL (`new URL(location, base)`) and
the proto chosen per-URL; a raw relative string passed to `http.get` throws
`ERR_INVALID_URL` *synchronously inside the async response callback*, which
escapes the Promise and crash-loops the whole server. All throws in that
callback must reject, never throw.
