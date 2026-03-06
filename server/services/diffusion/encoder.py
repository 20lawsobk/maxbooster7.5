"""
Text encoder + sinusoidal time embedding — from scratch.

Text:  bag-of-words over a 100-word music/scene vocabulary
       → embedding lookup → mean pool → linear → 32-dim dense vector

Time:  integer t → sinusoidal encoding (like transformer positional encoding)
       → 2-layer MLP → 32-dim dense vector
"""

import numpy as np
import math


# ── Vocabulary ─────────────────────────────────────────────────────────────

VOCAB = [
    # Scene environments
    'concert', 'stage', 'crowd', 'audience', 'venue', 'arena', 'festival',
    'spotlight', 'performer', 'live', 'show', 'tour',
    'city', 'night', 'urban', 'rain', 'street', 'skyline', 'building',
    'downtown', 'rooftop', 'neon', 'lights', 'traffic',
    'studio', 'record', 'session', 'mixing', 'console', 'booth', 'mic',
    'producer', 'engineer', 'monitor', 'headphones',
    'outdoor', 'sunset', 'sunrise', 'golden', 'nature', 'field', 'sky',
    'landscape', 'hills', 'trees', 'horizon', 'daylight',
    'club', 'bar', 'dance', 'rave', 'underground', 'glow', 'dark',
    'cyberpunk', 'futuristic', 'synthwave',
    # Music genres
    'hiphop', 'hip', 'hop', 'trap', 'rap', 'drill',
    'rnb', 'soul', 'gospel', 'neo',
    'pop', 'indie', 'folk', 'acoustic', 'country',
    'rock', 'metal', 'punk', 'alternative',
    'electronic', 'edm', 'techno', 'house', 'ambient',
    'afrobeats', 'latin', 'reggaeton',
    # Mood/tone
    'hype', 'chill', 'dark', 'bright', 'warm', 'cool', 'moody',
    'energetic', 'melancholy', 'romantic', 'aggressive',
    # Generic music words
    'music', 'artist', 'band', 'song', 'beat', 'track', 'album',
    'release', 'streaming', 'new', 'fire', 'hit',
    '<pad>', '<unk>',
]

WORD2IDX = {w: i for i, w in enumerate(VOCAB)}
VOCAB_SIZE = len(VOCAB)
PAD_IDX = WORD2IDX['<pad>']
UNK_IDX = WORD2IDX['<unk>']


def tokenize(text: str, max_len: int = 16) -> np.ndarray:
    """Convert text to token index array, padded to max_len."""
    tokens = text.lower().replace(',', ' ').replace('.', ' ').split()
    idxs = [WORD2IDX.get(t, UNK_IDX) for t in tokens][:max_len]
    # Pad
    idxs += [PAD_IDX] * (max_len - len(idxs))
    return np.array(idxs, dtype=np.int32)


# ── Text Encoder ───────────────────────────────────────────────────────────

class TextEncoder:
    """
    Bag-of-words text encoder:
      tokens → embedding lookup → mean pool → Linear → SiLU → Linear → [emb_dim]
    """

    def __init__(self, emb_dim: int = 32, token_emb_dim: int = 24):
        self.emb_dim = emb_dim
        self.token_emb_dim = token_emb_dim

        scale = 0.1
        self.params = {
            'emb':  (np.random.randn(VOCAB_SIZE, token_emb_dim) * scale).astype(np.float32),
            'W1':   (np.random.randn(emb_dim * 2, token_emb_dim) * math.sqrt(2 / token_emb_dim)).astype(np.float32),
            'b1':   np.zeros(emb_dim * 2, dtype=np.float32),
            'W2':   (np.random.randn(emb_dim, emb_dim * 2) * math.sqrt(2 / (emb_dim * 2))).astype(np.float32),
            'b2':   np.zeros(emb_dim, dtype=np.float32),
        }
        self.grads = {k: np.zeros_like(v) for k, v in self.params.items()}
        self._cache = None

    def forward(self, tokens: np.ndarray) -> np.ndarray:
        """tokens: [max_len] int32 → emb: [emb_dim] float32"""
        # Embedding lookup + mean pool (ignore PAD)
        mask = (tokens != PAD_IDX).astype(np.float32)            # [max_len]
        embs = self.params['emb'][tokens]                         # [max_len, token_emb_dim]
        pooled = (embs * mask[:, None]).sum(axis=0) / (mask.sum() + 1e-8)  # [token_emb_dim]

        # MLP
        h1 = pooled @ self.params['W1'].T + self.params['b1']    # [emb_dim*2]
        h1_act = h1 * (1.0 / (1.0 + np.exp(-h1.clip(-30, 30))))  # SiLU
        out = h1_act @ self.params['W2'].T + self.params['b2']    # [emb_dim]
        self._cache = (tokens, mask, embs, pooled, h1, h1_act)
        return out

    def backward(self, dout: np.ndarray) -> None:
        tokens, mask, embs, pooled, h1, h1_act = self._cache
        n_valid = (mask.sum() + 1e-8)

        self.grads['W2'] += np.outer(dout, h1_act)
        self.grads['b2'] += dout
        dh1_act = dout @ self.params['W2']                        # [emb_dim*2]

        # SiLU backward
        sig = 1.0 / (1.0 + np.exp(-h1.clip(-30, 30)))
        dh1 = dh1_act * sig * (1 + h1 * (1 - sig))

        self.grads['W1'] += np.outer(dh1, pooled)
        self.grads['b1'] += dh1
        dpooled = dh1 @ self.params['W1']                         # [token_emb_dim]

        dembs = dpooled[None, :] * mask[:, None] / n_valid        # [max_len, token_emb_dim]
        for i, tok in enumerate(tokens):
            self.grads['emb'][tok] += dembs[i]

    def zero_grads(self):
        for k in self.grads:
            self.grads[k][:] = 0.0


# ── Time Embedding ─────────────────────────────────────────────────────────

def sinusoidal_embedding(t: int, dim: int = 32) -> np.ndarray:
    """
    Sinusoidal positional encoding for diffusion timestep.
    Same formula as "Attention Is All You Need" positional encoding.
    t:   int timestep
    dim: embedding dimension (must be even)
    """
    assert dim % 2 == 0
    half = dim // 2
    freqs = np.exp(-np.arange(half, dtype=np.float32) * (math.log(10000) / (half - 1)))
    args  = t * freqs
    emb   = np.concatenate([np.sin(args), np.cos(args)]).astype(np.float32)
    return emb


class TimeEncoder:
    """
    Timestep → sinusoidal → 2-layer MLP → [emb_dim]
    Learns a rich time-dependent conditioning signal.
    """

    def __init__(self, sin_dim: int = 32, emb_dim: int = 32):
        self.sin_dim = sin_dim
        self.emb_dim = emb_dim
        hidden = emb_dim * 2
        self.params = {
            'W1': (np.random.randn(hidden, sin_dim) * math.sqrt(2 / sin_dim)).astype(np.float32),
            'b1': np.zeros(hidden, dtype=np.float32),
            'W2': (np.random.randn(emb_dim, hidden) * math.sqrt(2 / hidden)).astype(np.float32),
            'b2': np.zeros(emb_dim, dtype=np.float32),
        }
        self.grads = {k: np.zeros_like(v) for k, v in self.params.items()}
        self._cache = None

    def forward(self, t: int) -> np.ndarray:
        sin_emb = sinusoidal_embedding(t, self.sin_dim)
        h1 = sin_emb @ self.params['W1'].T + self.params['b1']
        h1_act = h1 * (1.0 / (1.0 + np.exp(-h1.clip(-30, 30))))
        out = h1_act @ self.params['W2'].T + self.params['b2']
        self._cache = (sin_emb, h1, h1_act)
        return out

    def backward(self, dout: np.ndarray) -> None:
        sin_emb, h1, h1_act = self._cache
        self.grads['W2'] += np.outer(dout, h1_act)
        self.grads['b2'] += dout
        dh1_act = dout @ self.params['W2']
        sig = 1.0 / (1.0 + np.exp(-h1.clip(-30, 30)))
        dh1 = dh1_act * sig * (1 + h1 * (1 - sig))
        self.grads['W1'] += np.outer(dh1, sin_emb)
        self.grads['b1'] += dh1

    def zero_grads(self):
        for k in self.grads:
            self.grads[k][:] = 0.0
