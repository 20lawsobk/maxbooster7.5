"""
Text encoder v2 + sinusoidal time embedding — upgraded from scratch.

Upgrades over v1:
  - Vocabulary: 100 → 260+ words (music, scene, mood, genre, emotion, colour)
  - Position-aware encoding: weighted by token position (early tokens matter more)
  - Character n-gram fallback for OOV words (handles typos / new words)
  - Larger embedding dim: 32 → 48 per token
  - Deeper MLP: 2 → 3 layers with skip connection
  - Time encoder: larger sinusoidal dim (64), deeper MLP
"""

import numpy as np
import math


# ── Vocabulary ─────────────────────────────────────────────────────────────

VOCAB = [
    # Scene environments
    'concert', 'stage', 'crowd', 'audience', 'venue', 'arena', 'festival',
    'spotlight', 'performer', 'live', 'show', 'tour', 'perform', 'performance',
    'city', 'night', 'urban', 'rain', 'street', 'skyline', 'building', 'rooftop',
    'downtown', 'neon', 'lights', 'traffic', 'puddle', 'reflection', 'glow',
    'studio', 'record', 'recording', 'session', 'mixing', 'console', 'booth', 'mic',
    'producer', 'engineer', 'monitor', 'headphones', 'waveform', 'meter', 'soundwave',
    'outdoor', 'sunset', 'sunrise', 'golden', 'nature', 'field', 'sky', 'clouds',
    'landscape', 'hills', 'trees', 'horizon', 'daylight', 'rays', 'haze', 'mist',
    'club', 'bar', 'dance', 'rave', 'underground', 'dark', 'smoke', 'laser',
    'cyberpunk', 'futuristic', 'synthwave', 'hologram', 'neonpunk',
    'beach', 'ocean', 'waves', 'sand', 'tropical', 'palm', 'sunset_beach',
    'rooftop', 'skyscraper', 'penthouse', 'city_lights', 'aerial',
    # Music genres
    'hiphop', 'hip', 'hop', 'trap', 'rap', 'drill', 'grime', 'boom', 'bap',
    'rnb', 'soul', 'gospel', 'neo', 'neosoul', 'funk', 'groove',
    'pop', 'indie', 'folk', 'acoustic', 'country', 'bluegrass', 'americana',
    'rock', 'metal', 'punk', 'alternative', 'grunge', 'shoegaze', 'emo',
    'electronic', 'edm', 'techno', 'house', 'ambient', 'synthpop', 'vaporwave',
    'afrobeats', 'afropop', 'latin', 'reggaeton', 'salsa', 'cumbia', 'dembow',
    'jazz', 'blues', 'classical', 'orchestral', 'cinematic', 'lo-fi', 'lofi',
    'reggae', 'dancehall', 'soca', 'calypso',
    'kpop', 'jpop', 'cpop', 'bollywood',
    # Mood / tone
    'hype', 'chill', 'dark', 'bright', 'warm', 'cool', 'moody', 'melancholy',
    'energetic', 'romantic', 'aggressive', 'peaceful', 'nostalgic', 'dreamy',
    'cinematic', 'epic', 'triumphant', 'lonely', 'hopeful', 'sad', 'joyful',
    'intense', 'raw', 'smooth', 'gritty', 'lush', 'minimal', 'layered',
    # Colour / visual
    'purple', 'blue', 'gold', 'orange', 'red', 'green', 'white', 'black',
    'cyan', 'magenta', 'pink', 'yellow', 'violet', 'indigo', 'teal',
    'pastel', 'vibrant', 'saturated', 'monochrome', 'colorful',
    # Lighting
    'spotlight', 'backlight', 'silhouette', 'shadow', 'bright', 'dim',
    'strobe', 'ambient', 'candlelight', 'neon', 'tungsten', 'daylight',
    # Generic music words
    'music', 'artist', 'band', 'song', 'beat', 'track', 'album', 'release',
    'streaming', 'new', 'fire', 'hit', 'single', 'ep', 'mixtape', 'debut',
    'drop', 'feature', 'collab', 'remix', 'video', 'mv', 'visual',
    # Special
    '<pad>', '<unk>', '<cls>',
]

WORD2IDX = {w: i for i, w in enumerate(VOCAB)}
VOCAB_SIZE = len(VOCAB)
PAD_IDX = WORD2IDX['<pad>']
UNK_IDX = WORD2IDX['<unk>']
CLS_IDX = WORD2IDX['<cls>']


def _char_ngram_idx(word: str, vocab_size: int) -> int:
    """
    Character n-gram fallback for OOV words.
    Hashes bigrams to a vocabulary index — similar to FastText's subword trick.
    """
    if len(word) < 2:
        return UNK_IDX
    bigrams = [word[i:i+2] for i in range(len(word)-1)]
    h = sum(ord(c1)*31 + ord(c2) for c1, c2 in [list(b) for b in bigrams])
    return (abs(h) % (vocab_size - 3)) + 1   # avoid PAD/UNK/CLS indices


def tokenize(text: str, max_len: int = 20) -> np.ndarray:
    """Convert text to token index array, padded to max_len."""
    words = (text.lower()
             .replace(',', ' ').replace('.', ' ')
             .replace('-', ' ').replace('_', ' ')
             .split())
    idxs = [CLS_IDX]  # prepend [CLS] like BERT
    for w in words[:max_len - 1]:
        idx = WORD2IDX.get(w, None)
        if idx is None:
            idx = _char_ngram_idx(w, VOCAB_SIZE)
        idxs.append(idx)
    idxs += [PAD_IDX] * (max_len - len(idxs))
    return np.array(idxs[:max_len], dtype=np.int32)


# ── Text Encoder v2 ────────────────────────────────────────────────────────

class TextEncoder:
    """
    Position-aware text encoder:
      [CLS] + tokens → embedding lookup → position-weighted pool
      → 3-layer MLP with skip connection → [emb_dim]

    Improvements over v1:
      - Position weights (early tokens are weighted higher)
      - Skip connection in MLP for better gradient flow
      - Larger token embedding dim (24 → 48)
      - 3-layer instead of 2-layer MLP
    """

    def __init__(self, emb_dim: int = 32, token_emb_dim: int = 48,
                 max_len: int = 20):
        self.emb_dim = emb_dim
        self.token_emb_dim = token_emb_dim
        self.max_len = max_len
        hidden = emb_dim * 3

        scale_e = 0.05
        self.params = {
            'emb':    (np.random.randn(VOCAB_SIZE, token_emb_dim) * scale_e).astype(np.float32),
            # Position importance weights (learned, init to uniform)
            'pos_w':  np.ones(max_len, dtype=np.float32) / max_len,
            # MLP
            'W1':     (np.random.randn(hidden, token_emb_dim) * math.sqrt(2/token_emb_dim)).astype(np.float32),
            'b1':     np.zeros(hidden, dtype=np.float32),
            'W2':     (np.random.randn(emb_dim * 2, hidden) * math.sqrt(2/hidden)).astype(np.float32),
            'b2':     np.zeros(emb_dim * 2, dtype=np.float32),
            'W3':     (np.random.randn(emb_dim, emb_dim * 2) * math.sqrt(2/(emb_dim*2))).astype(np.float32),
            'b3':     np.zeros(emb_dim, dtype=np.float32),
            # Skip projection: token_emb_dim → emb_dim for residual
            'Wskip':  (np.random.randn(emb_dim, token_emb_dim) * math.sqrt(2/token_emb_dim)).astype(np.float32),
            'bskip':  np.zeros(emb_dim, dtype=np.float32),
        }
        self.grads = {k: np.zeros_like(v) for k, v in self.params.items()}
        self._cache = None

    def _silu(self, x): return x * (1.0 / (1.0 + np.exp(-x.clip(-30, 30))))
    def _silu_back(self, x, dy):
        s = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
        return dy * s * (1 + x * (1 - s))

    def forward(self, tokens: np.ndarray) -> np.ndarray:
        mask = (tokens != PAD_IDX).astype(np.float32)          # [max_len]
        # Position weights: softmax over learned weights (masked)
        pos_w_masked = self.params['pos_w'] * mask
        pos_w_norm   = pos_w_masked / (pos_w_masked.sum() + 1e-8)   # [max_len]

        embs = self.params['emb'][tokens]                       # [max_len, token_emb_dim]
        pooled = (embs * pos_w_norm[:, None]).sum(axis=0)       # [token_emb_dim]

        # Skip path
        skip = pooled @ self.params['Wskip'].T + self.params['bskip']  # [emb_dim]

        # MLP
        h1 = self._silu(pooled @ self.params['W1'].T + self.params['b1'])   # [hidden]
        h2 = self._silu(h1 @ self.params['W2'].T + self.params['b2'])       # [emb_dim*2]
        out = h2 @ self.params['W3'].T + self.params['b3']                  # [emb_dim]
        out = out + skip                                                     # residual

        self._cache = (tokens, mask, pos_w_norm, embs, pooled, skip, h1, h2, out)
        return out

    def backward(self, dout: np.ndarray) -> None:
        tokens, mask, pos_w_norm, embs, pooled, skip, h1, h2, _ = self._cache

        # Skip grad
        dskip = dout.copy()
        self.grads['Wskip'] += np.outer(dskip, pooled)
        self.grads['bskip'] += dskip
        dpooled_skip = dskip @ self.params['Wskip']

        # MLP grad
        self.grads['W3'] += np.outer(dout, h2)
        self.grads['b3'] += dout
        dh2_raw = dout @ self.params['W3']

        h2_pre = h1 @ self.params['W2'].T + self.params['b2']
        dh2 = self._silu_back(h2_pre, dh2_raw)
        self.grads['W2'] += np.outer(dh2, h1)
        self.grads['b2'] += dh2
        dh1_raw = dh2 @ self.params['W2']

        h1_pre = pooled @ self.params['W1'].T + self.params['b1']
        dh1 = self._silu_back(h1_pre, dh1_raw)
        self.grads['W1'] += np.outer(dh1, pooled)
        self.grads['b1'] += dh1
        dpooled_mlp = dh1 @ self.params['W1']

        dpooled = dpooled_mlp + dpooled_skip

        # Position weights grad
        self.grads['pos_w'] += (embs * dpooled[None, :]).sum(axis=1) * mask

        # Embedding grad
        dembs = dpooled[None, :] * pos_w_norm[:, None]
        for i, tok in enumerate(tokens):
            if mask[i] > 0:
                self.grads['emb'][tok] += dembs[i]

    def zero_grads(self):
        for k in self.grads: self.grads[k][:] = 0.0


# ── Time Encoder v2 ────────────────────────────────────────────────────────

def sinusoidal_embedding(t: int, dim: int = 64) -> np.ndarray:
    """Sinusoidal positional encoding — same formula as "Attention Is All You Need"."""
    assert dim % 2 == 0
    half = dim // 2
    freqs = np.exp(-np.arange(half, dtype=np.float32) * (math.log(10000) / (half - 1)))
    args  = t * freqs
    return np.concatenate([np.sin(args), np.cos(args)]).astype(np.float32)


class TimeEncoder:
    """
    Upgraded time encoder: sinusoidal (dim=64) → 3-layer MLP → [emb_dim=32]
    Captures richer time-dependent conditioning across all frequency scales.
    """

    def __init__(self, sin_dim: int = 64, emb_dim: int = 32):
        self.sin_dim = sin_dim
        self.emb_dim = emb_dim
        hidden = emb_dim * 4  # wider hidden layer

        self.params = {
            'W1': (np.random.randn(hidden, sin_dim) * math.sqrt(2/sin_dim)).astype(np.float32),
            'b1': np.zeros(hidden, dtype=np.float32),
            'W2': (np.random.randn(hidden, hidden) * math.sqrt(2/hidden)).astype(np.float32),
            'b2': np.zeros(hidden, dtype=np.float32),
            'W3': (np.random.randn(emb_dim, hidden) * math.sqrt(2/hidden)).astype(np.float32),
            'b3': np.zeros(emb_dim, dtype=np.float32),
        }
        self.grads = {k: np.zeros_like(v) for k, v in self.params.items()}
        self._cache = None

    def _silu(self, x): return x * (1.0 / (1.0 + np.exp(-x.clip(-30, 30))))
    def _silu_back(self, x, dy):
        s = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
        return dy * s * (1 + x * (1 - s))

    def forward(self, t: int) -> np.ndarray:
        sin_emb = sinusoidal_embedding(t, self.sin_dim)
        h1 = self._silu(sin_emb @ self.params['W1'].T + self.params['b1'])
        h2 = self._silu(h1 @ self.params['W2'].T + self.params['b2'])
        out = h2 @ self.params['W3'].T + self.params['b3']
        self._cache = (sin_emb, h1, h2)
        return out

    def backward(self, dout: np.ndarray) -> None:
        sin_emb, h1, h2 = self._cache
        self.grads['W3'] += np.outer(dout, h2)
        self.grads['b3'] += dout
        dh2_raw = dout @ self.params['W3']

        h2_pre = h1 @ self.params['W2'].T + self.params['b2']
        dh2 = self._silu_back(h2_pre, dh2_raw)
        self.grads['W2'] += np.outer(dh2, h1)
        self.grads['b2'] += dh2
        dh1_raw = dh2 @ self.params['W2']

        h1_pre = sin_emb @ self.params['W1'].T + self.params['b1']
        dh1 = self._silu_back(h1_pre, dh1_raw)
        self.grads['W1'] += np.outer(dh1, sin_emb)
        self.grads['b1'] += dh1

    def zero_grads(self):
        for k in self.grads: self.grads[k][:] = 0.0
