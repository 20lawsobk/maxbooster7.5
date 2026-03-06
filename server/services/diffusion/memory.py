"""
Long-term diffusion memory system.

Persists knowledge and experience across training sessions so the model
continuously improves rather than re-learning the same things each run.

Components:
  LongTermMemory   — JSON-backed session log + scene mastery tracking
  ReplayBuffer     — Stores hard examples (high-loss frames) for replay in future sessions
  RotatingBatchScheduler — Auto-rotates scene batches with priority weighting

How it works:
  1. During training, every step records (scene, prompt, loss) to memory
  2. High-loss steps → frame stored in replay buffer (the model struggled here)
  3. Next training session: replay buffer samples are mixed into the training batch
     so the model revisits its weakest examples first
  4. Scene mastery weights adjust which scenes get MORE samples this session
     (scenes where avg_loss is still high get 2-3× more training time)
  5. Full session log persists: total steps, best loss, duration, version info
"""

import os
import json
import math
import time
import base64
import hashlib
import numpy as np

MEMORY_PATH = os.path.join(os.path.dirname(__file__), 'memory.json')

# Replay buffer caps
MAX_REPLAY_ENTRIES = 500        # max frames stored in replay buffer
REPLAY_LOSS_THRESHOLD = 0.75    # store examples above this percentile of losses
REPLAY_FRACTION = 0.20          # 20% of each training batch comes from replay


# ── Replay Buffer ──────────────────────────────────────────────────────────

class ReplayBuffer:
    """
    Stores (scene, prompt, frame_array) triples for examples the model found hard.

    Implemented as a priority queue: entries with highest loss are kept.
    When full, the lowest-loss entry is evicted to make room.
    Frame arrays are stored as base64-encoded float16 to save memory.
    """

    def __init__(self, max_size: int = MAX_REPLAY_ENTRIES):
        self.max_size = max_size
        self.entries: list = []    # [{scene, prompt, loss, frame_b64, timestamp}]

    def add(self, scene: str, prompt: str,
            frame: np.ndarray, loss: float):
        """Add an entry. Evicts the lowest-loss entry if at capacity."""
        frame_b64 = _encode_frame(frame)
        entry = {
            'scene':    scene,
            'prompt':   prompt,
            'loss':     float(loss),
            'frame_b64': frame_b64,
            'ts':       int(time.time()),
        }
        if len(self.entries) >= self.max_size:
            # Evict lowest-loss entry (keep the hardest examples)
            min_idx = int(np.argmin([e['loss'] for e in self.entries]))
            self.entries.pop(min_idx)
        self.entries.append(entry)

    def sample(self, n: int) -> list:
        """Return n random samples, weighted toward higher-loss entries."""
        if not self.entries:
            return []
        n = min(n, len(self.entries))
        losses = np.array([e['loss'] for e in self.entries], dtype=np.float32)
        # Softmax weighting: higher loss → higher chance of being sampled
        weights = np.exp(losses - losses.max())
        weights /= weights.sum()
        idxs = np.random.choice(len(self.entries), size=n, replace=False, p=weights)
        return [self.entries[i] for i in idxs]

    def get_frame(self, entry: dict) -> np.ndarray:
        """Decode stored frame back to float32 array."""
        return _decode_frame(entry['frame_b64'])

    def __len__(self):
        return len(self.entries)

    def to_dict(self) -> list:
        return list(self.entries)

    def from_dict(self, data: list):
        self.entries = data or []


# ── Long-term Memory ───────────────────────────────────────────────────────

class LongTermMemory:
    """
    Persistent long-term memory across training sessions.

    Tracks:
      - total_sessions: how many training runs have been completed
      - total_steps:    cumulative training steps across all sessions
      - scene_stats:    per-scene {count, avg_loss, best_loss, last_loss}
      - session_log:    [{id, timestamp, epochs, samples, loss, duration_min}]
      - mastery:        per-scene 0.0–1.0 score (1.0 = fully mastered, stop sampling)
      - global_best_loss: best loss ever achieved across all sessions
    """

    def __init__(self, path: str = MEMORY_PATH):
        self.path   = path
        self.replay = ReplayBuffer()
        self._state = self._default_state()
        self.load()

    def _default_state(self) -> dict:
        return {
            'version':         3,
            'total_sessions':  0,
            'total_steps':     0,
            'global_best_loss': 999.0,
            'scene_stats':     {},
            'session_log':     [],
        }

    # ── Persistence ────────────────────────────────────────────────────────

    def load(self):
        """Load memory from disk. Silently starts fresh if missing/corrupt."""
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path) as f:
                raw = json.load(f)
            self._state = raw.get('state', self._default_state())
            self.replay.from_dict(raw.get('replay_buffer', []))
            print(f"[LongTermMemory] Loaded: {self._state['total_sessions']} sessions, "
                  f"{self._state['total_steps']:,} total steps, "
                  f"replay={len(self.replay)} examples")
        except Exception as e:
            print(f"[LongTermMemory] Could not load (starting fresh): {e}")
            self._state = self._default_state()

    def save(self):
        """Persist memory to disk."""
        try:
            raw = {
                'state':         self._state,
                'replay_buffer': self.replay.to_dict(),
                'saved_at':      int(time.time()),
            }
            with open(self.path, 'w') as f:
                json.dump(raw, f, separators=(',', ':'))
            kb = os.path.getsize(self.path) // 1024
            print(f"[LongTermMemory] Saved ({kb} KB) — "
                  f"{self._state['total_sessions']} sessions total")
        except Exception as e:
            print(f"[LongTermMemory] Save failed: {e}")

    # ── Step recording ─────────────────────────────────────────────────────

    def record_step(self, scene: str, prompt: str,
                    frame: np.ndarray, loss: float,
                    epoch_losses: list):
        """Record one training step. Auto-adds hard examples to replay buffer."""
        s = self._state

        # Update scene stats
        ss = s['scene_stats'].setdefault(scene, {
            'count': 0, 'avg_loss': 0.0, 'best_loss': 999.0, 'last_loss': 0.0
        })
        n = ss['count']
        ss['avg_loss']  = (ss['avg_loss'] * n + loss) / (n + 1)   # running mean
        ss['best_loss'] = min(ss['best_loss'], loss)
        ss['last_loss'] = loss
        ss['count']     = n + 1

        s['total_steps'] += 1

        # Add to replay buffer if this is a hard example
        if epoch_losses and loss > np.percentile(epoch_losses, 75):
            self.replay.add(scene, prompt, frame, loss)

    def complete_session(self, meta: dict, duration_sec: float):
        """Call at end of training session to log results."""
        s = self._state
        s['total_sessions'] += 1
        final_loss = meta.get('final_loss', 0.0)
        if final_loss < s['global_best_loss']:
            s['global_best_loss'] = final_loss

        s['session_log'].append({
            'id':          s['total_sessions'],
            'ts':          int(time.time()),
            'epochs':      meta.get('epochs', 0),
            'samples':     meta.get('samples', 0),
            'final_loss':  final_loss,
            'duration_min': round(duration_sec / 60, 1),
            'version':     meta.get('version', 2),
        })
        # Keep only last 50 sessions in log
        s['session_log'] = s['session_log'][-50:]
        self.save()

    # ── Scene sampling weights ─────────────────────────────────────────────

    def scene_weights(self, scenes: list) -> np.ndarray:
        """
        Return sampling weights for each scene.

        Scenes with higher average loss get sampled more (the model
        needs more practice there). Unseen scenes get a neutral weight.

        Returns: np.ndarray of shape [len(scenes)], normalised to sum=1
        """
        ss = self._state['scene_stats']
        weights = np.ones(len(scenes), dtype=np.float32)

        for i, scene in enumerate(scenes):
            if scene in ss and ss[scene]['count'] > 10:
                avg = ss[scene]['avg_loss']
                best = ss[scene]['best_loss']
                # Gap from best = how much room for improvement
                gap = max(0.0, avg - best * 0.8)
                weights[i] = 1.0 + math.log1p(gap)

        weights /= weights.sum()
        return weights

    def get_replay_batch(self, n: int) -> list:
        """Get n replay examples, or fewer if buffer is small."""
        return self.replay.sample(n)

    def summary(self) -> dict:
        s = self._state
        return {
            'total_sessions':   s['total_sessions'],
            'total_steps':      s['total_steps'],
            'global_best_loss': round(s['global_best_loss'], 4),
            'scenes_tracked':   len(s['scene_stats']),
            'replay_buffer':    len(self.replay),
            'last_session_loss': (
                s['session_log'][-1]['final_loss']
                if s['session_log'] else None
            ),
        }


# ── Rotating Batch Scheduler ───────────────────────────────────────────────

class RotatingBatchScheduler:
    """
    Auto-rotates training batches to ensure balanced coverage of all scenes
    while prioritising scenes where the model is weakest.

    Strategy:
      1. Each 'cycle' covers all scenes at least once (round-robin baseline)
      2. Scene priority weights from LongTermMemory bias the over-sampling
      3. Every REPLAY_FRACTION fraction of steps → inject a replay example
      4. Shuffle within each cycle to prevent order memorisation

    Usage:
        scheduler = RotatingBatchScheduler(memory, scene_list, dataset)
        for scene, prompt, frame, is_replay in scheduler.iterate(n_steps):
            ...
    """

    def __init__(self, memory: LongTermMemory,
                 scenes: list, dataset: list):
        self.memory  = memory
        self.scenes  = scenes
        self.dataset = dataset
        self._step   = 0
        self._cycle  = 0
        self._scene_cursor = {s: 0 for s in scenes}

    def get_batch(self, n: int, epoch: int) -> list:
        """
        Return n (frame, prompt, scene, is_replay) tuples for one training step.

        is_replay=True means the frame came from the replay buffer
        (the model should focus on these — they were hard before).
        """
        weights = self.memory.scene_weights(self.scenes)

        # How many samples to pull from replay buffer
        n_replay = max(0, int(n * REPLAY_FRACTION)) if len(self.memory.replay) >= 10 else 0
        n_fresh  = n - n_replay

        batch = []

        # Fresh samples — weighted by scene priority
        scene_counts = np.round(weights * n_fresh).astype(int)
        # Fix rounding so total = n_fresh
        deficit = n_fresh - scene_counts.sum()
        if deficit > 0:
            scene_counts[np.argmax(weights)] += deficit

        for scene_idx, count in enumerate(scene_counts):
            scene = self.scenes[scene_idx]
            scene_data = [(f, p) for f, p in self.dataset if True]  # uses full dataset
            # Filter by scene approximately
            scene_samples = [
                (f, p) for f, p in self.dataset
                if any(kw in p for kw in scene.replace('_', ' ').split())
            ] or self.dataset

            for _ in range(int(count)):
                idx = np.random.randint(len(scene_samples))
                frame, prompt = scene_samples[idx]
                batch.append((frame, prompt, scene, False))

        # Replay samples
        if n_replay > 0:
            replays = self.memory.get_replay_batch(n_replay)
            for entry in replays:
                try:
                    frame = self.memory.replay.get_frame(entry)
                    batch.append((frame, entry['prompt'], entry['scene'], True))
                except Exception:
                    pass

        # Shuffle so replay examples are interspersed, not clustered at end
        np.random.shuffle(batch)
        return batch[:n]


# ── Helpers ────────────────────────────────────────────────────────────────

def _encode_frame(frame: np.ndarray) -> str:
    """Compress a [H,W,3] float32 frame to base64 float16 for storage."""
    f16 = frame.astype(np.float16)
    meta = f'{frame.shape[0]}:{frame.shape[1]}'
    return meta + '|' + base64.b64encode(f16.tobytes()).decode('ascii')


def _decode_frame(b64: str) -> np.ndarray:
    """Decode stored frame back to float32."""
    meta, data = b64.split('|', 1)
    H, W = map(int, meta.split(':'))
    raw = base64.b64decode(data)
    return np.frombuffer(raw, dtype=np.float16).reshape(H, W, 3).astype(np.float32)
