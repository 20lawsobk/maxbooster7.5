"""
Advanced Custom Memory Layer — MaxCore Diffusion Training Store
===============================================================
A multi-tier, semantically-aware memory system that stores, indexes, and
retrieves training data across sessions to continuously improve the UNetV4
and DiT-24 diffusion models.

Architecture
────────────
  Tier 1 — HotCache        (RAM)
    Ring buffer of the last N training steps. Zero I/O latency.
    Feeds the time simulator's augmentation burst with fresh context.

  Tier 2 — EpisodicStore   (disk, per-scene NPZ shards)
    Compressed float16 frame archives, one .npz shard per scene category.
    Priority-scored metadata index (JSON). Survives restarts. Unlimited capacity.

  Tier 3 — GradientMemory  (RAM + JSON checkpoint)
    Tracks gradient magnitudes and loss-improvement deltas per parameter group.
    Identifies which training directions produce the biggest quality gains.

  Tier 4 — SessionRegistry (JSON)
    Immutable append-only log of every completed training session with full
    hyperparameter and loss-curve records. Provides the long-term trend view.

Priority Scoring
────────────────
  Every stored frame gets a priority score:
    priority = loss_norm × novelty × recency_decay × scene_weight

    loss_norm     = loss / global_avg_loss  (relative difficulty)
    novelty       = 1 - cosine_sim(frame_mean_vec, scene_mean_vec)
    recency_decay = exp(-λ × days_since_added)  (recent failures matter more)
    scene_weight  = 1 + log1p(scene_avg_loss - scene_best_loss)

  High-priority frames are oversampled during replay, driving the model to
  spend more time on genuinely difficult, novel examples.

Semantic Prompt Index
──────────────────────
  A lightweight TF-IDF index over all stored prompts enables nearest-neighbour
  retrieval: given a new prompt, find the top-K stored frames whose prompts are
  semantically closest. Used for interpolation partner selection.

Usage
──────
  from diffusion.advanced_memory import AdvancedMemoryLayer

  mem = AdvancedMemoryLayer()

  # During training
  mem.record(scene, prompt, frame_seq, loss, grad_norm, epoch, step)

  # Priority replay sampling
  batch = mem.sample_priority(n=64)

  # Semantic nearest-neighbour for interpolation
  partners = mem.find_similar_prompts(prompt, top_k=3)

  # Gradient tracking
  mem.record_gradient(param_group_id, grad_norm, loss_delta)

  # Status (FastAPI endpoint compatible)
  info = mem.status()
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE              = os.path.dirname(os.path.abspath(__file__))
_MEM_DIR           = os.path.join(_HERE, 'advanced_memory')
_REGISTRY_PATH     = os.path.join(_MEM_DIR, 'session_registry.json')
_META_INDEX_PATH   = os.path.join(_MEM_DIR, 'frame_index.json')
_GRAD_MEMORY_PATH  = os.path.join(_MEM_DIR, 'gradient_memory.json')
_PROMPT_INDEX_PATH = os.path.join(_MEM_DIR, 'prompt_index.json')

os.makedirs(_MEM_DIR, exist_ok=True)

# ── Constants ─────────────────────────────────────────────────────────────────
HOT_CACHE_SIZE       = 512        # RAM ring buffer entries
MAX_SHARD_FRAMES     = 2_000      # frames per scene NPZ shard
RECENCY_LAMBDA       = 0.15       # decay rate (higher = older frames fade faster)
MAX_GRAD_HISTORY     = 1_000      # gradient records kept in memory
MAX_REGISTRY_ENTRIES = 200        # session log entries
MAX_PROMPT_VOCAB     = 8_000      # TF-IDF vocabulary size


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 1 — HOT CACHE
# ══════════════════════════════════════════════════════════════════════════════

class HotCache:
    """
    In-RAM ring buffer of recent training steps.
    Provides zero-latency access to the most recent N frames.
    """

    def __init__(self, max_size: int = HOT_CACHE_SIZE):
        self.max_size = max_size
        self._buf: deque = deque(maxlen=max_size)

    def push(self, entry: dict) -> None:
        self._buf.append(entry)

    def sample(self, n: int, strategy: str = "priority") -> List[dict]:
        """
        Sample n entries from the hot cache.

        strategy:
          "priority"  — weighted by loss (harder examples sampled more)
          "recent"    — last n entries (LIFO)
          "uniform"   — random uniform
        """
        if not self._buf:
            return []
        n = min(n, len(self._buf))
        buf_list = list(self._buf)

        if strategy == "recent":
            return buf_list[-n:]

        if strategy == "uniform":
            idxs = np.random.choice(len(buf_list), n, replace=False)
            return [buf_list[i] for i in idxs]

        # priority (default) — softmax over loss
        losses = np.array([e.get("loss", 1.0) for e in buf_list], dtype=np.float64)
        losses = np.clip(losses, 0.0, losses.max() + 1e-8)
        weights = np.exp(losses - losses.max())
        weights /= weights.sum()
        idxs = np.random.choice(len(buf_list), n, replace=False, p=weights)
        return [buf_list[i] for i in idxs]

    def peek_latest(self, n: int = 10) -> List[dict]:
        buf_list = list(self._buf)
        return buf_list[-n:]

    def __len__(self) -> int:
        return len(self._buf)

    def stats(self) -> Dict[str, Any]:
        if not self._buf:
            return {"size": 0, "avg_loss": None, "scenes": []}
        losses = [e.get("loss", 0.0) for e in self._buf]
        scenes = list({e.get("scene", "?") for e in self._buf})
        return {
            "size":     len(self._buf),
            "capacity": self.max_size,
            "avg_loss": round(float(np.mean(losses)), 4),
            "max_loss": round(float(np.max(losses)),  4),
            "scenes":   scenes[:10],
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 2 — EPISODIC STORE (NPZ shards per scene)
# ══════════════════════════════════════════════════════════════════════════════

class EpisodicStore:
    """
    Disk-backed compressed frame store.

    Each scene gets its own NPZ shard: <scene>.npz
    Metadata (priority, prompt, loss, timestamps) lives in frame_index.json.
    Frames are stored as float16 to halve disk/memory cost.

    Shard rotation: when a shard hits MAX_SHARD_FRAMES, lowest-priority entries
    are evicted to make room (priority queue semantics).
    """

    def __init__(self, store_dir: str = _MEM_DIR):
        self.store_dir  = store_dir
        self._index: List[dict] = []      # [{id, scene, prompt, loss, priority, path, shard_idx, ts}]
        self._scene_means: Dict[str, np.ndarray] = {}  # for novelty scoring
        self._load_index()

    # ── Index persistence ──────────────────────────────────────────────────────

    def _load_index(self) -> None:
        if os.path.exists(_META_INDEX_PATH):
            try:
                with open(_META_INDEX_PATH) as f:
                    self._index = json.load(f)
                print(f"[EpisodicStore] Loaded index: {len(self._index)} entries "
                      f"across {len(self._scene_set())} scenes")
            except Exception as e:
                print(f"[EpisodicStore] Index load error ({e}) — starting fresh")
                self._index = []

    def _save_index(self) -> None:
        tmp = _META_INDEX_PATH + ".tmp"
        try:
            with open(tmp, "w") as f:
                json.dump(self._index, f, separators=(",", ":"))
            os.replace(tmp, _META_INDEX_PATH)
        except Exception as e:
            print(f"[EpisodicStore] Index save error: {e}")

    def _scene_set(self) -> set:
        return {e["scene"] for e in self._index}

    # ── Shard I/O ──────────────────────────────────────────────────────────────

    def _shard_path(self, scene: str) -> str:
        safe = scene.replace("/", "_").replace(" ", "_")[:40]
        return os.path.join(self.store_dir, f"shard_{safe}.npz")

    def _load_shard(self, scene: str) -> Dict[str, np.ndarray]:
        path = self._shard_path(scene)
        if not os.path.exists(path):
            return {}
        try:
            return dict(np.load(path, allow_pickle=False))
        except Exception as e:
            print(f"[EpisodicStore] Shard read error ({scene}): {e}")
            return {}

    def _save_shard(self, scene: str, data: Dict[str, np.ndarray]) -> None:
        path     = self._shard_path(scene)                  # e.g. shard_foo.npz
        tmp_base = path[:-4] + "_tmp"                       # shard_foo_tmp  (no .npz)
        tmp_npz  = tmp_base + ".npz"                        # numpy will create this
        try:
            np.savez_compressed(tmp_base, **data)           # → shard_foo_tmp.npz
            os.replace(tmp_npz, path)                       # → shard_foo.npz (atomic)
        except Exception as e:
            print(f"[EpisodicStore] Shard save error ({scene}): {e}")
            if os.path.exists(tmp_npz):
                try:
                    os.remove(tmp_npz)
                except Exception:
                    pass

    # ── Priority scoring ───────────────────────────────────────────────────────

    def _compute_priority(
        self,
        scene:      str,
        frame_seq:  np.ndarray,
        loss:       float,
        ts:         float,
    ) -> float:
        """
        priority = loss_norm × novelty × recency_decay × scene_weight

        All terms bounded to [0, 10] so the score stays readable.
        """
        # Loss normalisation
        scene_entries = [e for e in self._index if e["scene"] == scene]
        if scene_entries:
            avg_loss  = np.mean([e["loss"] for e in scene_entries])
            best_loss = min(e["loss"] for e in scene_entries)
            loss_norm = (loss / (avg_loss + 1e-8))
            scene_weight = 1.0 + math.log1p(max(0.0, avg_loss - best_loss * 0.8))
        else:
            loss_norm    = 1.0
            scene_weight = 1.0

        # Novelty: compare this frame's colour mean to stored scene mean
        frame_mean = frame_seq.mean(axis=(0, 1, 2)) if frame_seq.ndim == 4 else frame_seq.mean(axis=(0, 1))
        if scene in self._scene_means:
            stored_mean = self._scene_means[scene]
            cosine_sim  = float(
                np.dot(frame_mean, stored_mean) /
                (np.linalg.norm(frame_mean) * np.linalg.norm(stored_mean) + 1e-8)
            )
            novelty = 1.0 - max(0.0, cosine_sim)
        else:
            novelty = 1.0

        # Update rolling scene mean (exponential moving average)
        if scene not in self._scene_means:
            self._scene_means[scene] = frame_mean.copy()
        else:
            self._scene_means[scene] = (
                0.95 * self._scene_means[scene] + 0.05 * frame_mean
            )

        # Recency decay — freshly added frames score higher
        age_days = (time.time() - ts) / 86400.0
        recency  = math.exp(-RECENCY_LAMBDA * age_days)

        priority = loss_norm * (0.5 + 0.5 * novelty) * recency * scene_weight
        return min(10.0, max(0.0, priority))

    # ── Write ──────────────────────────────────────────────────────────────────

    def store(
        self,
        scene:     str,
        prompt:    str,
        frame_seq: np.ndarray,
        loss:      float,
        grad_norm: float = 0.0,
        epoch:     int = 0,
        step:      int = 0,
    ) -> str:
        """
        Store a frame sequence.  Returns the entry ID.

        frame_seq shape: (T, H, W, 3) float32  OR  (H, W, 3) float32
        Stored as float16 for 2× compression.
        """
        ts       = time.time()
        entry_id = hashlib.sha1(
            f"{scene}:{prompt[:40]}:{step}:{ts:.2f}".encode()
        ).hexdigest()[:16]

        priority = self._compute_priority(scene, frame_seq, loss, ts)

        # Load existing shard for this scene
        shard = self._load_shard(scene)
        scene_entries = [e for e in self._index if e["scene"] == scene]

        # Evict lowest-priority if shard is full
        if len(scene_entries) >= MAX_SHARD_FRAMES:
            if scene_entries:
                evict_entry = min(scene_entries, key=lambda e: e.get("priority", 0.0))
                evict_id    = evict_entry["id"]
                shard.pop(evict_id, None)
                self._index = [e for e in self._index if e["id"] != evict_id]

        # Store frame as float16
        shard[entry_id] = frame_seq.astype(np.float16)
        self._save_shard(scene, shard)

        # Update index
        self._index.append({
            "id":        entry_id,
            "scene":     scene,
            "prompt":    prompt[:120],
            "loss":      round(float(loss), 5),
            "grad_norm": round(float(grad_norm), 5),
            "priority":  round(priority, 4),
            "epoch":     epoch,
            "step":      step,
            "ts":        int(ts),
        })

        # Persist index every 100 new entries
        if len(self._index) % 100 == 0:
            self._save_index()

        return entry_id

    # ── Read ───────────────────────────────────────────────────────────────────

    def retrieve(self, entry_id: str, scene: str) -> Optional[np.ndarray]:
        """Retrieve a stored frame sequence by entry_id. Returns float32."""
        shard = self._load_shard(scene)
        raw   = shard.get(entry_id)
        if raw is None:
            return None
        return raw.astype(np.float32)

    def sample_priority(self, n: int, scene: Optional[str] = None) -> List[dict]:
        """
        Sample n entries weighted by priority score.

        Returns list of metadata dicts (no frames — caller retrieves with retrieve()).
        Optionally filter by scene.
        """
        pool = [e for e in self._index if (scene is None or e["scene"] == scene)]
        if not pool:
            return []
        n = min(n, len(pool))
        priorities = np.array([e.get("priority", 1.0) for e in pool], dtype=np.float64)
        priorities = np.clip(priorities, 0.0, None)
        if priorities.sum() < 1e-8:
            priorities = np.ones(len(pool))
        weights = priorities / priorities.sum()
        idxs    = np.random.choice(len(pool), n, replace=False, p=weights)
        return [pool[i] for i in idxs]

    def sample_hardest(self, n: int, scene: Optional[str] = None) -> List[dict]:
        """Return the n entries with the highest loss values."""
        pool = [e for e in self._index if (scene is None or e["scene"] == scene)]
        sorted_pool = sorted(pool, key=lambda e: e.get("loss", 0.0), reverse=True)
        return sorted_pool[:n]

    def sample_newest(self, n: int) -> List[dict]:
        """Return the n most recently added entries."""
        sorted_pool = sorted(self._index, key=lambda e: e.get("ts", 0), reverse=True)
        return sorted_pool[:n]

    # ── Stats ──────────────────────────────────────────────────────────────────

    def stats(self) -> Dict[str, Any]:
        if not self._index:
            return {"total_frames": 0, "scenes": {}}

        scene_stats: Dict[str, Any] = {}
        for scene in self._scene_set():
            entries = [e for e in self._index if e["scene"] == scene]
            losses  = [e["loss"] for e in entries]
            scene_stats[scene] = {
                "count":      len(entries),
                "avg_loss":   round(float(np.mean(losses)), 4),
                "best_loss":  round(float(np.min(losses)),  4),
                "worst_loss": round(float(np.max(losses)),  4),
                "avg_priority": round(
                    float(np.mean([e.get("priority", 0) for e in entries])), 3
                ),
            }

        shard_sizes_kb: Dict[str, int] = {}
        for scene in self._scene_set():
            p = self._shard_path(scene)
            if os.path.exists(p):
                shard_sizes_kb[scene] = os.path.getsize(p) // 1024

        return {
            "total_frames":    len(self._index),
            "scenes":          scene_stats,
            "shard_sizes_kb":  shard_sizes_kb,
            "index_path":      _META_INDEX_PATH,
        }


# ══════════════════════════════════════════════════════════════════════════════
#  SEMANTIC PROMPT INDEX  (TF-IDF nearest-neighbour)
# ══════════════════════════════════════════════════════════════════════════════

class PromptIndex:
    """
    Lightweight TF-IDF index over all stored prompts.

    Enables semantic nearest-neighbour retrieval:
      given a new prompt → find stored frames with the most similar prompts
      → use them as interpolation partners or for targeted replay.

    No external dependencies (pure numpy + dict).
    """

    def __init__(self, max_vocab: int = MAX_PROMPT_VOCAB):
        self.max_vocab   = max_vocab
        self._vocab:      Dict[str, int]  = {}     # word → vocab index
        self._idf:        Optional[np.ndarray] = None
        self._doc_ids:    List[str]        = []    # entry_id per document
        self._doc_scenes: List[str]        = []
        self._tfidf_mat:  Optional[np.ndarray] = None  # (n_docs, vocab_size)
        self._dirty       = False
        self._load()

    def _load(self) -> None:
        if os.path.exists(_PROMPT_INDEX_PATH):
            try:
                with open(_PROMPT_INDEX_PATH) as f:
                    saved = json.load(f)
                self._vocab      = saved.get("vocab", {})
                self._doc_ids    = saved.get("doc_ids", [])
                self._doc_scenes = saved.get("doc_scenes", [])
                mat_path         = _PROMPT_INDEX_PATH.replace(".json", "_mat.npz")
                if os.path.exists(mat_path):
                    d = np.load(mat_path, allow_pickle=False)
                    self._tfidf_mat = d["mat"].astype(np.float32)
                    self._idf       = d["idf"].astype(np.float32)
                print(f"[PromptIndex] Loaded: {len(self._doc_ids)} docs, "
                      f"vocab={len(self._vocab)}")
            except Exception as e:
                print(f"[PromptIndex] Load error ({e}) — starting fresh")

    def _save(self) -> None:
        try:
            saved = {
                "vocab":      self._vocab,
                "doc_ids":    self._doc_ids,
                "doc_scenes": self._doc_scenes,
            }
            with open(_PROMPT_INDEX_PATH, "w") as f:
                json.dump(saved, f, separators=(",", ":"))
            if self._tfidf_mat is not None and self._idf is not None:
                mat_path = _PROMPT_INDEX_PATH.replace(".json", "_mat.npz")
                np.savez_compressed(mat_path,
                                    mat=self._tfidf_mat.astype(np.float16),
                                    idf=self._idf.astype(np.float32))
        except Exception as e:
            print(f"[PromptIndex] Save error: {e}")

    @staticmethod
    def _tokenise(prompt: str) -> List[str]:
        return [w.lower().strip(".,!?;:\"'") for w in prompt.split() if len(w) > 2]

    def _tf_vec(self, tokens: List[str]) -> np.ndarray:
        """Compute raw term-frequency vector for a token list."""
        vec = np.zeros(len(self._vocab), dtype=np.float32)
        for tok in tokens:
            if tok in self._vocab:
                vec[self._vocab[tok]] += 1.0
        total = vec.sum()
        if total > 0:
            vec /= total
        return vec

    def add(self, entry_id: str, scene: str, prompt: str) -> None:
        """Add a prompt to the index. Rebuilds IDF lazily."""
        tokens = self._tokenise(prompt)
        # Expand vocabulary
        for tok in tokens:
            if tok not in self._vocab and len(self._vocab) < self.max_vocab:
                self._vocab[tok] = len(self._vocab)

        tf_vec = self._tf_vec(tokens)

        if self._tfidf_mat is None:
            self._tfidf_mat = tf_vec.reshape(1, -1)
        else:
            # Pad existing matrix if vocab grew
            if tf_vec.shape[0] > self._tfidf_mat.shape[1]:
                pad = tf_vec.shape[0] - self._tfidf_mat.shape[1]
                self._tfidf_mat = np.pad(self._tfidf_mat, ((0, 0), (0, pad)))
            self._tfidf_mat = np.vstack([self._tfidf_mat, tf_vec])

        self._doc_ids.append(entry_id)
        self._doc_scenes.append(scene)
        self._dirty = True

        # Rebuild IDF and save every 500 new docs
        if len(self._doc_ids) % 500 == 0:
            self._rebuild_idf()
            self._save()

    def _rebuild_idf(self) -> None:
        if self._tfidf_mat is None or self._tfidf_mat.shape[0] == 0:
            return
        n_docs = self._tfidf_mat.shape[0]
        # IDF = log(n_docs / (1 + df))  where df = number of docs containing term
        df = (self._tfidf_mat > 0).sum(axis=0).astype(np.float32)
        self._idf = np.log(n_docs / (1.0 + df))
        self._dirty = False

    def find_similar(self, prompt: str, top_k: int = 5,
                     exclude_scene: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Return top_k most semantically similar stored prompts.
        Optionally exclude entries from the same scene (force cross-scene retrieval).
        """
        if self._tfidf_mat is None or len(self._doc_ids) == 0:
            return []

        if self._dirty or self._idf is None:
            self._rebuild_idf()

        tokens = self._tokenise(prompt)
        q_vec  = self._tf_vec(tokens)
        # Pad query if vocab grew since last rebuild
        if q_vec.shape[0] < self._tfidf_mat.shape[1]:
            q_vec = np.pad(q_vec, (0, self._tfidf_mat.shape[1] - q_vec.shape[0]))

        # Apply IDF weighting
        idf = self._idf if self._idf is not None else np.ones(self._tfidf_mat.shape[1])
        q_tfidf  = q_vec * idf
        doc_tfidf = self._tfidf_mat * idf

        # Cosine similarity
        q_norm   = np.linalg.norm(q_tfidf) + 1e-8
        doc_norms = np.linalg.norm(doc_tfidf, axis=1) + 1e-8
        sims = doc_tfidf @ q_tfidf / (doc_norms * q_norm)

        # Build results
        results = []
        sorted_idx = np.argsort(sims)[::-1]
        for idx in sorted_idx:
            scene = self._doc_scenes[idx] if idx < len(self._doc_scenes) else "?"
            if exclude_scene and scene == exclude_scene:
                continue
            results.append({
                "entry_id":  self._doc_ids[idx],
                "scene":     scene,
                "similarity": round(float(sims[idx]), 4),
            })
            if len(results) >= top_k:
                break
        return results

    def stats(self) -> Dict[str, Any]:
        return {
            "total_docs":  len(self._doc_ids),
            "vocab_size":  len(self._vocab),
            "matrix_shape": (
                list(self._tfidf_mat.shape) if self._tfidf_mat is not None else None
            ),
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 3 — GRADIENT MEMORY
# ══════════════════════════════════════════════════════════════════════════════

class GradientMemory:
    """
    Tracks gradient norms and loss-improvement deltas per training step.

    Used to:
      • Identify which parameter groups are producing the biggest improvements
      • Detect gradient explosion / vanishing early
      • Correlate scene type with gradient quality
      • Feed the time simulator's adaptive LR with richer signal
    """

    def __init__(self) -> None:
        self._records: deque = deque(maxlen=MAX_GRAD_HISTORY)
        self._scene_grad_map: Dict[str, List[float]] = {}
        self._load()

    def _load(self) -> None:
        if os.path.exists(_GRAD_MEMORY_PATH):
            try:
                with open(_GRAD_MEMORY_PATH) as f:
                    saved = json.load(f)
                for rec in saved.get("records", []):
                    self._records.append(rec)
                self._scene_grad_map = saved.get("scene_grad_map", {})
            except Exception:
                pass

    def save(self) -> None:
        tmp = _GRAD_MEMORY_PATH + ".tmp"
        try:
            saved = {
                "records":        list(self._records)[-200:],
                "scene_grad_map": {
                    k: v[-50:] for k, v in self._scene_grad_map.items()
                },
                "saved_at": int(time.time()),
            }
            with open(tmp, "w") as f:
                json.dump(saved, f, separators=(",", ":"))
            os.replace(tmp, _GRAD_MEMORY_PATH)
        except Exception as e:
            print(f"[GradientMemory] Save error: {e}")

    def record(self, scene: str, grad_norm: float, loss: float,
               loss_delta: float, epoch: int, step: int) -> None:
        self._records.append({
            "scene":      scene,
            "grad_norm":  round(float(grad_norm), 5),
            "loss":       round(float(loss), 5),
            "loss_delta": round(float(loss_delta), 6),
            "epoch":      epoch,
            "step":       step,
            "ts":         int(time.time()),
        })
        if scene not in self._scene_grad_map:
            self._scene_grad_map[scene] = []
        self._scene_grad_map[scene].append(float(grad_norm))
        if len(self._scene_grad_map[scene]) > 100:
            self._scene_grad_map[scene] = self._scene_grad_map[scene][-100:]

    def avg_grad_norm(self, last_n: int = 50) -> float:
        recs = list(self._records)[-last_n:]
        if not recs:
            return 0.0
        return float(np.mean([r["grad_norm"] for r in recs]))

    def scene_grad_health(self) -> Dict[str, str]:
        """Return 'healthy' / 'vanishing' / 'exploding' per scene."""
        health: Dict[str, str] = {}
        for scene, norms in self._scene_grad_map.items():
            recent = norms[-20:] if len(norms) >= 20 else norms
            avg    = float(np.mean(recent))
            if avg < 0.01:
                health[scene] = "vanishing"
            elif avg > 5.0:
                health[scene] = "exploding"
            else:
                health[scene] = "healthy"
        return health

    def stats(self) -> Dict[str, Any]:
        recs  = list(self._records)
        if not recs:
            return {"total_records": 0}
        recent = recs[-50:]
        return {
            "total_records":    len(recs),
            "avg_grad_norm":    round(float(np.mean([r["grad_norm"] for r in recent])), 5),
            "avg_loss_delta":   round(float(np.mean([r["loss_delta"] for r in recent])), 6),
            "scenes_tracked":   len(self._scene_grad_map),
            "gradient_health":  self.scene_grad_health(),
        }


# ══════════════════════════════════════════════════════════════════════════════
#  SESSION REGISTRY
# ══════════════════════════════════════════════════════════════════════════════

class SessionRegistry:
    """
    Immutable append-only log of all training sessions.
    Provides the long-term quality trend view and training genealogy.
    """

    def __init__(self) -> None:
        self._sessions: List[dict] = []
        self._load()

    def _load(self) -> None:
        if os.path.exists(_REGISTRY_PATH):
            try:
                with open(_REGISTRY_PATH) as f:
                    self._sessions = json.load(f)
                print(f"[SessionRegistry] Loaded {len(self._sessions)} sessions")
            except Exception:
                self._sessions = []

    def _save(self) -> None:
        tmp = _REGISTRY_PATH + ".tmp"
        try:
            with open(tmp, "w") as f:
                json.dump(self._sessions[-MAX_REGISTRY_ENTRIES:], f, indent=2)
            os.replace(tmp, _REGISTRY_PATH)
        except Exception as e:
            print(f"[SessionRegistry] Save error: {e}")

    def register(self, meta: dict, sim_stats: Optional[dict] = None) -> int:
        """Record a completed training session. Returns session number."""
        session_id = len(self._sessions) + 1
        record     = {
            "session_id":    session_id,
            "ts":            int(time.time()),
            "version":       meta.get("version", 4),
            "epochs":        meta.get("epochs", 0),
            "samples":       meta.get("samples_per_epoch", 0),
            "final_loss":    meta.get("final_loss", 0.0),
            "best_loss":     meta.get("best_loss",  0.0),
            "total_seconds": meta.get("total_seconds", 0.0),
            "resolution":    meta.get("resolution", 96),
            "T":             meta.get("T", 4),
            "scene_categories": meta.get("scene_categories", 0),
            "total_prompts": meta.get("total_prompts", 0),
            "loss_curve":    meta.get("losses", [])[-20:],  # last 20 epoch losses
            "sim_stats":     sim_stats,
        }
        self._sessions.append(record)
        self._save()
        return session_id

    def global_best_loss(self) -> float:
        if not self._sessions:
            return float("inf")
        return min((s.get("final_loss", float("inf")) for s in self._sessions),
                   default=float("inf"))

    def loss_trend(self) -> str:
        """Human-readable summary of how loss has changed across sessions."""
        if len(self._sessions) < 2:
            return "insufficient_data"
        recent   = [s["final_loss"] for s in self._sessions[-5:]]
        old_loss = self._sessions[0]["final_loss"]
        new_loss = recent[-1]
        pct      = (old_loss - new_loss) / (old_loss + 1e-8) * 100
        if pct > 30:
            return f"excellent (-{pct:.0f}% from session 1)"
        if pct > 10:
            return f"good (-{pct:.0f}% from session 1)"
        if pct > 0:
            return f"improving (-{pct:.0f}% from session 1)"
        return f"stalling (+{-pct:.0f}% regression)"

    def stats(self) -> Dict[str, Any]:
        if not self._sessions:
            return {"total_sessions": 0}
        last = self._sessions[-1]
        return {
            "total_sessions":    len(self._sessions),
            "global_best_loss":  round(self.global_best_loss(), 5),
            "last_final_loss":   last.get("final_loss"),
            "last_session_id":   last.get("session_id"),
            "total_training_h":  round(
                sum(s.get("total_seconds", 0) for s in self._sessions) / 3600, 2
            ),
            "loss_trend":        self.loss_trend(),
        }


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN FACADE — AdvancedMemoryLayer
# ══════════════════════════════════════════════════════════════════════════════

class AdvancedMemoryLayer:
    """
    Single entry-point that orchestrates all four memory tiers.

    Typical usage from train_v4():

        mem = AdvancedMemoryLayer()

        # Every training step
        mem.record(scene, prompt, frame_seq, loss, grad_norm, epoch, step, loss_delta)

        # Priority replay batch
        entries = mem.sample_priority(n=32)
        for entry in entries:
            frame = mem.retrieve_frame(entry)

        # Semantic partner for interpolation
        partners = mem.find_similar_prompts(prompt, top_k=3)

        # End of session
        mem.complete_session(train_meta, sim.status())
        info = mem.status()   # for FastAPI endpoint
    """

    def __init__(self) -> None:
        print("[AdvancedMemoryLayer] Initialising multi-tier memory …")
        self.hot       = HotCache()
        self.episodic  = EpisodicStore()
        self.prompt_idx = PromptIndex()
        self.gradients  = GradientMemory()
        self.registry   = SessionRegistry()
        self._step_count = 0
        self._session_start = time.time()
        print(f"[AdvancedMemoryLayer] Ready — "
              f"{len(self.episodic._index)} episodic frames, "
              f"{self.registry.stats()['total_sessions']} sessions logged")

    # ── Main record ────────────────────────────────────────────────────────────

    def record(
        self,
        scene:      str,
        prompt:     str,
        frame_seq:  np.ndarray,
        loss:       float,
        grad_norm:  float = 0.0,
        epoch:      int   = 0,
        step:       int   = 0,
        loss_delta: float = 0.0,
    ) -> None:
        """
        Record one training step across all memory tiers.

        frame_seq: (T, H, W, 3) float32  OR  (H, W, 3) float32
        """
        self._step_count += 1

        # Tier 1 — always push to hot cache
        hot_entry = {
            "scene":     scene,
            "prompt":    prompt,
            "loss":      float(loss),
            "grad_norm": float(grad_norm),
            "epoch":     epoch,
            "step":      step,
            "ts":        time.time(),
        }
        self.hot.push(hot_entry)

        # Tier 3 — gradient memory (every step)
        self.gradients.record(scene, grad_norm, loss, loss_delta, epoch, step)

        # Tier 2 — episodic store (only high-priority examples to save I/O)
        # Store if loss is in top 40% OR every 20th step for baseline coverage
        should_store = (
            loss > 0.5 or           # hard example heuristic
            self._step_count % 20 == 0  # periodic baseline coverage
        )
        if should_store:
            entry_id = self.episodic.store(
                scene, prompt, frame_seq, loss, grad_norm, epoch, step
            )
            # Semantic index — add to prompt index for later retrieval
            self.prompt_idx.add(entry_id, scene, prompt)

        # Save gradient memory periodically
        if self._step_count % 200 == 0:
            self.gradients.save()

        # Persist episodic index periodically
        if self._step_count % 500 == 0:
            self.episodic._save_index()

    # ── Retrieval ──────────────────────────────────────────────────────────────

    def sample_priority(self, n: int = 32,
                        scene: Optional[str] = None) -> List[dict]:
        """
        Return n high-priority episodic entries for replay.
        Returns metadata dicts — call retrieve_frame() to get the actual frames.
        """
        return self.episodic.sample_priority(n, scene=scene)

    def sample_hot(self, n: int = 16,
                   strategy: str = "priority") -> List[dict]:
        """Sample n recent entries from the hot cache."""
        return self.hot.sample(n, strategy=strategy)

    def retrieve_frame(self, entry: dict) -> Optional[np.ndarray]:
        """Retrieve the frame stored for a given metadata entry."""
        entry_id = entry.get("id")
        scene    = entry.get("scene")
        if not entry_id or not scene:
            return None
        return self.episodic.retrieve(entry_id, scene)

    def find_similar_prompts(
        self,
        prompt:        str,
        top_k:         int  = 5,
        exclude_scene: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Find stored frames with semantically similar prompts.
        Used by the time simulator to select good interpolation partners.
        """
        return self.prompt_idx.find_similar(
            prompt, top_k=top_k, exclude_scene=exclude_scene
        )

    def get_interpolation_partner(
        self,
        scene:  str,
        prompt: str,
    ) -> Optional[Tuple[np.ndarray, str]]:
        """
        Find the best cross-scene interpolation partner for (scene, prompt).

        Returns (frame_seq, partner_prompt) or None if nothing suitable found.
        Used by the time simulator to generate synthetic blended training examples.
        """
        similar = self.find_similar_prompts(
            prompt, top_k=5, exclude_scene=scene
        )
        for match in similar:
            frame = self.retrieve_frame(match)
            if frame is not None:
                # Find the prompt for this entry from the index
                entry_meta = next(
                    (e for e in self.episodic._index if e["id"] == match["entry_id"]),
                    None,
                )
                partner_prompt = entry_meta["prompt"] if entry_meta else prompt
                return frame, partner_prompt
        return None

    # ── Session management ────────────────────────────────────────────────────

    def complete_session(
        self,
        train_meta: dict,
        sim_stats:  Optional[dict] = None,
    ) -> int:
        """Call at the end of every training session."""
        # Final saves
        self.gradients.save()
        self.episodic._save_index()
        self.prompt_idx._save()
        session_id = self.registry.register(train_meta, sim_stats)
        print(f"[AdvancedMemoryLayer] Session {session_id} registered — "
              f"episodic={len(self.episodic._index)} frames, "
              f"hot={len(self.hot)} entries")
        return session_id

    # ── Status (FastAPI endpoint compatible) ───────────────────────────────────

    def status(self) -> Dict[str, Any]:
        elapsed = time.time() - self._session_start
        return {
            "session_steps":     self._step_count,
            "session_elapsed_s": round(elapsed, 1),
            "hot_cache":         self.hot.stats(),
            "episodic_store":    self.episodic.stats(),
            "prompt_index":      self.prompt_idx.stats(),
            "gradient_memory":   self.gradients.stats(),
            "session_registry":  self.registry.stats(),
        }


# ── Module-level singleton ─────────────────────────────────────────────────────
_instance: Optional[AdvancedMemoryLayer] = None


def get_memory() -> AdvancedMemoryLayer:
    """Get or create the module-level AdvancedMemoryLayer singleton."""
    global _instance
    if _instance is None:
        _instance = AdvancedMemoryLayer()
    return _instance
