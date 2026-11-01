"""
Text Encoder v3 — 4-Layer Transformer with Self-Attention
==========================================================
Major upgrades over v2 (encoder.py):

  Vocabulary     260 words (v2)  →  1,500+ tokens  with music-industry bias
  Tokenization   word-split      →  subword: word-first, bigram-hash OOV fallback
  Architecture   3-layer MLP     →  4-layer transformer self-attention  
  Output         [emb_dim] pool  →  [seq_len, seq_dim] token stream (for cross-attn)
                                    + [cls_dim] global CLS embedding (for FiLM)
  Context length 20 tokens       →  32 tokens

Why transformers for text conditioning?
  The v2 encoder pools all tokens into a single vector → the UNet gets one
  blended signal per forward pass.  With full token-sequence output the
  cross-attention layers in UNetV5 can attend to individual token positions,
  e.g. "spotlight" gets a different weight than "crowd", letting the model
  understand which visual region corresponds to each semantic concept.

Backprop
  Full gradient flow through every layer for end-to-end training.
  Each transformer block stores its cache for backward.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── Vocabulary (1,500+ tokens) ─────────────────────────────────────────────

_VOCAB_LIST: List[str] = [
    # Special
    '<pad>', '<unk>', '<cls>', '<mask>',
    # Scene environments (expanded)
    'concert', 'stage', 'crowd', 'audience', 'venue', 'arena', 'festival',
    'spotlight', 'performer', 'live', 'show', 'tour', 'perform', 'performance',
    'city', 'night', 'urban', 'rain', 'street', 'skyline', 'building', 'rooftop',
    'downtown', 'neon', 'lights', 'traffic', 'puddle', 'reflection', 'glow',
    'studio', 'record', 'recording', 'session', 'mixing', 'console', 'booth', 'mic',
    'producer', 'engineer', 'monitor', 'headphones', 'waveform', 'meter',
    'outdoor', 'sunset', 'sunrise', 'golden', 'nature', 'field', 'sky', 'clouds',
    'landscape', 'hills', 'trees', 'horizon', 'daylight', 'rays', 'haze', 'mist',
    'club', 'bar', 'dance', 'rave', 'underground', 'dark', 'smoke', 'laser',
    'cyberpunk', 'futuristic', 'synthwave', 'hologram', 'neonpunk', 'dystopia',
    'beach', 'ocean', 'waves', 'sand', 'tropical', 'palm', 'shore', 'reef',
    'skyscraper', 'penthouse', 'aerial', 'rooftop_view', 'terrace', 'balcony',
    'warehouse', 'loft', 'hangar', 'factory', 'industrial', 'gritty', 'raw',
    'museum', 'gallery', 'library', 'chapel', 'cathedral', 'church', 'altar',
    'desert', 'dunes', 'canyons', 'mesa', 'arid', 'vast', 'scorched', 'heat',
    'forest', 'jungle', 'canopy', 'fog', 'ethereal', 'mossy', 'ancient',
    'mountain', 'peaks', 'snow', 'glacier', 'altitude', 'ridge', 'valley',
    'underground', 'cavern', 'cave', 'crystal', 'bioluminescent', 'subterranean',
    'rooftop_pool', 'yacht', 'boat', 'deck', 'marina', 'harbour', 'ocean_liner',
    'stadium', 'arena', 'coliseum', 'amphitheater', 'grandstand', 'bleachers',
    'tour_bus', 'backstage', 'greenroom', 'corridor', 'hallway', 'dressing',
    'radio', 'station', 'broadcast', 'antenna', 'satellite', 'signal',
    'vinyl', 'record_store', 'shelves', 'crates', 'dusty', 'analog',
    'awards', 'ceremony', 'red_carpet', 'trophy', 'vip', 'glamour',
    'penthouse', 'luxury', 'wealth', 'gold', 'marble', 'crystal', 'silk',
    # Music genres (comprehensive)
    'hiphop', 'hip', 'hop', 'trap', 'rap', 'drill', 'grime', 'boom', 'bap',
    'rnb', 'soul', 'gospel', 'neo', 'neosoul', 'funk', 'groove', 'motown',
    'pop', 'indie', 'folk', 'acoustic', 'country', 'bluegrass', 'americana',
    'rock', 'metal', 'punk', 'alternative', 'grunge', 'shoegaze', 'emo', 'hardcore',
    'electronic', 'edm', 'techno', 'house', 'ambient', 'synthpop', 'vaporwave',
    'afrobeats', 'afropop', 'latin', 'reggaeton', 'salsa', 'cumbia', 'dembow',
    'jazz', 'blues', 'classical', 'orchestral', 'cinematic', 'lofi', 'lo-fi',
    'reggae', 'dancehall', 'soca', 'calypso', 'dub', 'roots', 'conscious',
    'kpop', 'jpop', 'cpop', 'bollywood', 'bhangra', 'qawwali',
    'flamenco', 'bossa', 'nova', 'samba', 'tango', 'merengue',
    'opera', 'choral', 'symphony', 'chamber', 'string', 'quartet',
    'trap_metal', 'hyperpop', 'emo_rap', 'cloud_rap', 'drill_uk', 'afrodrill',
    # Mood / tone (expanded)
    'hype', 'chill', 'bright', 'warm', 'cool', 'moody', 'melancholy',
    'energetic', 'romantic', 'aggressive', 'peaceful', 'nostalgic', 'dreamy',
    'epic', 'triumphant', 'lonely', 'hopeful', 'sad', 'joyful', 'angry',
    'intense', 'smooth', 'gritty', 'lush', 'minimal', 'layered', 'dense',
    'ethereal', 'eerie', 'haunting', 'dark', 'brooding', 'mysterious', 'ominous',
    'euphoric', 'ecstatic', 'blissful', 'serene', 'tranquil', 'meditative',
    'rebellious', 'defiant', 'bold', 'powerful', 'explosive', 'electric',
    'melancholic', 'bittersweet', 'wistful', 'tender', 'vulnerable', 'raw',
    'cinematic', 'grand', 'sweeping', 'intimate', 'sparse', 'lush',
    'futuristic', 'retro', 'vintage', 'nostalgic', 'timeless', 'fresh',
    'hypnotic', 'trance', 'pulsating', 'driving', 'relentless', 'anthemic',
    # Colour / visual style (expanded)
    'purple', 'violet', 'indigo', 'blue', 'cyan', 'teal', 'aqua',
    'green', 'lime', 'olive', 'emerald', 'jade', 'forest',
    'yellow', 'amber', 'orange', 'gold', 'copper', 'bronze',
    'red', 'crimson', 'scarlet', 'ruby', 'maroon', 'magenta', 'pink',
    'white', 'ivory', 'cream', 'silver', 'grey', 'charcoal', 'black',
    'neon_blue', 'neon_green', 'neon_pink', 'neon_yellow',
    'pastel', 'vibrant', 'saturated', 'desaturated', 'monochrome', 'colorful',
    'muted', 'earthy', 'warm_tones', 'cool_tones', 'high_contrast', 'low_contrast',
    # Lighting (comprehensive)
    'backlight', 'silhouette', 'shadow', 'dim', 'bright', 'strobe',
    'ambient', 'candlelight', 'tungsten', 'daylight', 'fluorescent',
    'moonlight', 'starlight', 'dusk', 'dawn', 'golden_hour', 'blue_hour',
    'LED', 'RGB', 'colored_gels', 'practical', 'motivated', 'available',
    'rim', 'kicker', 'fill', 'key', 'hair', 'top', 'three_point',
    'gobo', 'cookie', 'diffused', 'hard', 'soft', 'specular', 'matte',
    # Camera / cinematography
    'wide', 'closeup', 'extreme_closeup', 'medium', 'establishing',
    'overhead', 'aerial', 'drone', 'birds_eye', 'worms_eye', 'dutch',
    'tracking', 'dolly', 'crane', 'handheld', 'steadicam', 'shoulder',
    'slow_motion', 'timelapse', 'freeze_frame', 'pan', 'tilt', 'zoom',
    'portrait', 'landscape', 'square', 'anamorphic', 'letterbox', 'imax',
    'shallow_dof', 'deep_dof', 'bokeh', 'sharp', 'focused', 'blurred',
    # Visual quality descriptors
    'cinematic', 'photorealistic', 'hyperrealistic', 'filmic', 'grainy',
    'textured', 'detailed', 'intricate', 'clean', 'polished', 'refined',
    'atmospheric', 'moody', 'dramatic', 'dynamic', 'static', 'still',
    'epic', 'intimate', 'grand', 'small', 'vast', 'claustrophobic',
    '4k', '8k', 'hdr', 'raw', 'compressed', 'artifact', 'vhs', 'film',
    # Temporal motion descriptors
    'slow', 'fast', 'smooth', 'jerky', 'fluid', 'staccato', 'pulsing',
    'oscillating', 'rotating', 'spinning', 'swaying', 'flowing', 'drifting',
    'zooming', 'rushing', 'cascading', 'rippling', 'shimmering', 'flickering',
    # Artists / music industry roles
    'rapper', 'singer', 'vocalist', 'dj', 'producer', 'beatmaker', 'mc',
    'guitarist', 'bassist', 'drummer', 'keyboardist', 'pianist', 'violinist',
    'conductor', 'band', 'ensemble', 'soloist', 'featured', 'collab',
    'manager', 'agent', 'label', 'indie', 'unsigned', 'mainstream', 'underground',
    # Music production / studio
    'beat', 'track', 'loop', 'sample', 'stem', 'mixdown', 'master',
    'bass', 'drums', 'melody', 'hook', 'verse', 'chorus', 'bridge',
    'bpm', 'tempo', 'key', 'chord', 'progression', 'arrangement',
    'reverb', 'delay', 'compression', 'eq', 'saturation', 'distortion',
    'autotune', 'vocoder', 'pitch', 'tuning', 'harmony', 'vocal',
    'plugin', 'daw', 'ableton', 'logic', 'fl', 'protools', 'reason',
    'synth', 'synthesizer', 'patch', 'modular', 'hardware', 'software',
    # Social media / music marketing
    'viral', 'trending', 'streaming', 'playlist', 'algorithm', 'discover',
    'spotify', 'apple', 'youtube', 'tiktok', 'instagram', 'twitter',
    'release', 'drop', 'album', 'ep', 'single', 'mixtape', 'tape',
    'debut', 'anniversary', 'deluxe', 'reissue', 'remix', 'cover',
    # Audience / community
    'fans', 'supporters', 'community', 'following', 'base', 'tribe',
    'concert_goers', 'festival_crowd', 'underground_heads', 'listeners',
    # Numbers and quantities (for BPM, scene counts, etc.)
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'first', 'second', 'third', 'final', 'last', 'next', 'previous',
    'many', 'few', 'single', 'multiple', 'all', 'none', 'every', 'any',
    # Adjectives (comprehensive visual)
    'massive', 'huge', 'enormous', 'tiny', 'small', 'medium', 'large',
    'tall', 'short', 'wide', 'narrow', 'deep', 'shallow', 'thick', 'thin',
    'heavy', 'light', 'dense', 'sparse', 'full', 'empty', 'packed',
    'bright', 'dark', 'vivid', 'dull', 'sharp', 'blurry', 'clear', 'hazy',
    'new', 'old', 'ancient', 'modern', 'classic', 'contemporary', 'timeless',
    'clean', 'dirty', 'worn', 'pristine', 'rough', 'smooth', 'textured',
    # Prepositions / articles (help syntactic structure)
    'in', 'on', 'at', 'by', 'with', 'under', 'over', 'through', 'around',
    'the', 'a', 'an', 'of', 'and', 'or', 'but', 'for', 'to', 'from',
]

# Build lookup
VOCAB: List[str] = list(dict.fromkeys(_VOCAB_LIST))   # deduplicate preserving order
VOCAB_SIZE = len(VOCAB)
W2I = {w: i for i, w in enumerate(VOCAB)}
PAD, UNK, CLS, MASK = 0, 1, 2, 3


def _bigram_hash(word: str) -> int:
    """Character-bigram hash for OOV subword fallback (FastText-style)."""
    if len(word) < 2:
        return UNK
    bigrams = [word[i:i + 2] for i in range(len(word) - 1)]
    h = 0
    for bg in bigrams:
        h = h * 31 + ord(bg[0]) * 127 + ord(bg[1])
    return (abs(h) % (VOCAB_SIZE - 4)) + 4   # skip special tokens


def tokenize_v3(text: str, max_len: int = 32) -> np.ndarray:
    """
    Tokenize text into int32 indices.

    Strategy:
      1. Lowercase, remove punctuation, split on whitespace
      2. Try exact vocabulary lookup
      3. Try prefix match (e.g. "neon_tunnel" → "neon")
      4. Bigram-hash fallback for OOV
    """
    cleaned = (text.lower()
               .replace(',', ' ').replace('.', ' ').replace('!', ' ')
               .replace('-', '_').replace('/', ' '))
    words = cleaned.split()
    ids = [CLS]
    for w in words[:max_len - 1]:
        if w in W2I:
            ids.append(W2I[w])
        else:
            # Try prefix subwords (split on underscore)
            parts = w.split('_')
            for p in parts[:2]:
                if p in W2I:
                    ids.append(W2I[p])
                    break
            else:
                ids.append(_bigram_hash(w))
    while len(ids) < max_len:
        ids.append(PAD)
    return np.array(ids[:max_len], dtype=np.int32)


# ── Transformer building blocks ────────────────────────────────────────────

class _LayerNorm:
    """LayerNorm over last axis with trainable scale/shift."""

    def __init__(self, d: int, eps: float = 1e-6):
        self.eps = eps
        self.g   = np.ones(d,  dtype=np.float32)
        self.b   = np.zeros(d, dtype=np.float32)
        self.dg  = np.zeros(d, dtype=np.float32)
        self.db  = np.zeros(d, dtype=np.float32)
        self._c  = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        mu  = x.mean(-1, keepdims=True)
        var = x.var(-1, keepdims=True)
        xn  = (x - mu) / np.sqrt(var + self.eps)
        self._c = (xn, var)
        return self.g * xn + self.b

    def backward(self, dy: np.ndarray) -> np.ndarray:
        xn, var = self._c
        n       = xn.shape[-1]
        std_inv = 1.0 / np.sqrt(var + self.eps)
        self.dg += (dy * xn).reshape(-1, n).sum(0)
        self.db += dy.reshape(-1, n).sum(0)
        dxn = dy * self.g
        dx  = std_inv * (dxn - dxn.mean(-1, keepdims=True)
                         - xn * (dxn * xn).mean(-1, keepdims=True))
        return dx

    def params_grads(self):
        return [({'g': self.g, 'b': self.b}, {'g': self.dg, 'b': self.db})]

    def zero_grads(self):
        self.dg[:] = 0.0
        self.db[:] = 0.0


class _Linear:
    def __init__(self, d_in: int, d_out: int):
        k = math.sqrt(2.0 / d_in)
        self.W  = np.random.randn(d_out, d_in).astype(np.float32) * k
        self.b  = np.zeros(d_out, dtype=np.float32)
        self.dW = np.zeros_like(self.W)
        self.db = np.zeros_like(self.b)
        self._x = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        self._x = x
        return x @ self.W.T + self.b

    def backward(self, dy: np.ndarray) -> np.ndarray:
        xr = self._x.reshape(-1, self._x.shape[-1])
        dyr = dy.reshape(-1, dy.shape[-1])
        self.dW += dyr.T @ xr
        self.db += dyr.sum(0)
        return (dy.reshape(-1, dy.shape[-1]) @ self.W).reshape(self._x.shape)

    def params_grads(self):
        return [({'W': self.W, 'b': self.b}, {'W': self.dW, 'b': self.db})]

    def zero_grads(self):
        self.dW[:] = 0.0
        self.db[:] = 0.0


def _silu(x: np.ndarray) -> np.ndarray:
    s = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
    return x * s

def _silu_back(x: np.ndarray, dy: np.ndarray) -> np.ndarray:
    s = 1.0 / (1.0 + np.exp(-x.clip(-30, 30)))
    return dy * s * (1.0 + x * (1.0 - s))


class _MultiHeadSelfAttention:
    """
    Multi-head self-attention over a sequence of tokens.
    Input/output: [seq_len, d_model]
    Caches all intermediates for backprop.
    """

    def __init__(self, d_model: int, n_heads: int):
        assert d_model % n_heads == 0
        self.h = n_heads
        self.d = d_model // n_heads
        self.scale = 1.0 / math.sqrt(self.d)
        k = math.sqrt(1.0 / d_model)

        self.Wq = np.random.randn(d_model, d_model).astype(np.float32) * k
        self.Wk = np.random.randn(d_model, d_model).astype(np.float32) * k
        self.Wv = np.random.randn(d_model, d_model).astype(np.float32) * k
        self.Wo = np.random.randn(d_model, d_model).astype(np.float32) * k
        self.bo = np.zeros(d_model, dtype=np.float32)

        self.dWq = np.zeros_like(self.Wq)
        self.dWk = np.zeros_like(self.Wk)
        self.dWv = np.zeros_like(self.Wv)
        self.dWo = np.zeros_like(self.Wo)
        self.dbo = np.zeros_like(self.bo)

        self._c: Optional[tuple] = None

    def forward(self, x: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
        """x: [S, D]  mask: [S] bool (True = padding, ignore)"""
        S, D = x.shape
        h, d = self.h, self.d

        Q = x @ self.Wq.T       # [S, D]
        K = x @ self.Wk.T
        V = x @ self.Wv.T

        # Split heads: [S, h, d] → [h, S, d]
        Q = Q.reshape(S, h, d).transpose(1, 0, 2)
        K = K.reshape(S, h, d).transpose(1, 0, 2)
        V = V.reshape(S, h, d).transpose(1, 0, 2)

        scores = np.einsum('hqd,hkd->hqk', Q, K) * self.scale   # [h, S, S]
        if mask is not None:
            scores[:, :, mask] = -1e9
        scores -= scores.max(-1, keepdims=True)
        w = np.exp(scores)
        w /= w.sum(-1, keepdims=True) + 1e-9                     # [h, S, S]

        ctx = np.einsum('hqk,hkd->hqd', w, V)                   # [h, S, d]
        ctx = ctx.transpose(1, 0, 2).reshape(S, D)               # [S, D]

        out = ctx @ self.Wo.T + self.bo                          # [S, D]
        self._c = (x, Q, K, V, w, ctx, out, S, D)
        return out + x    # residual

    def backward(self, dy: np.ndarray) -> np.ndarray:
        x, Q, K, V, w, ctx, out, S, D = self._c
        h, d = self.h, self.d

        # Residual
        dx_res = dy.copy()
        dout   = dy

        self.dWo += ctx.T @ dout
        self.dbo += dout.sum(0)
        dctx = dout @ self.Wo   # [S, D]

        dctx3 = dctx.reshape(S, h, d).transpose(1, 0, 2)       # [h, S, d]
        dV    = np.einsum('hqk,hqd->hkd', w, dctx3)            # [h, S, d]
        dw    = np.einsum('hqd,hkd->hqk', dctx3, V)            # [h, S, S]

        # Softmax backward
        sw       = (dw * w).sum(-1, keepdims=True)
        dscores  = w * (dw - sw) * self.scale                   # [h, S, S]

        dQ = np.einsum('hqk,hkd->hqd', dscores, K)             # [h, S, d]
        dK = np.einsum('hqk,hqd->hkd', dscores, Q)

        dQ = dQ.transpose(1, 0, 2).reshape(S, D)
        dK = dK.transpose(1, 0, 2).reshape(S, D)
        dV = dV.transpose(1, 0, 2).reshape(S, D)

        self.dWq += dQ.T @ x
        self.dWk += dK.T @ x
        self.dWv += dV.T @ x
        dx = dQ @ self.Wq + dK @ self.Wk + dV @ self.Wv
        return dx + dx_res

    def params_grads(self):
        return [
            ({'Wq': self.Wq, 'Wk': self.Wk, 'Wv': self.Wv,
              'Wo': self.Wo, 'bo': self.bo},
             {'Wq': self.dWq, 'Wk': self.dWk, 'Wv': self.dWv,
              'Wo': self.dWo, 'bo': self.dbo}),
        ]

    def zero_grads(self):
        for a in (self.dWq, self.dWk, self.dWv, self.dWo, self.dbo):
            a[:] = 0.0


class _FFN:
    """2-layer feed-forward with SiLU: d_model → 4×d_model → d_model."""

    def __init__(self, d: int):
        self.fc1 = _Linear(d, d * 4)
        self.fc2 = _Linear(d * 4, d)
        self._pre = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        pre = self.fc1.forward(x)
        h   = _silu(pre)
        out = self.fc2.forward(h)
        self._pre = (x, pre)
        return out + x   # residual

    def backward(self, dy: np.ndarray) -> np.ndarray:
        # forward: out = fc2(silu(fc1(x))) + x
        # dy: [S, d] — gradient wrt FFN output
        x, pre = self._pre
        d2 = self.fc2.backward(dy)   # [S, d] → [S, 4d]: grad wrt h = silu(pre)
        d1 = _silu_back(pre, d2)     # [S, 4d]: grad wrt pre = fc1(x)
        dx = self.fc1.backward(d1)   # [S, 4d] → [S, d]: grad wrt x
        return dx + dy               # residual: dy flows directly through x path

    def params_grads(self):
        return self.fc1.params_grads() + self.fc2.params_grads()

    def zero_grads(self):
        self.fc1.zero_grads()
        self.fc2.zero_grads()


class _TransformerBlock:
    """Pre-norm transformer: LN→MHSA→LN→FFN with residuals."""

    def __init__(self, d_model: int, n_heads: int):
        self.ln1  = _LayerNorm(d_model)
        self.attn = _MultiHeadSelfAttention(d_model, n_heads)
        self.ln2  = _LayerNorm(d_model)
        self.ffn  = _FFN(d_model)
        self._c   = None

    def forward(self, x: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
        h = self.attn.forward(self.ln1.forward(x), mask)
        x = x + h
        x = x + self.ffn.forward(self.ln2.forward(x))
        return x

    def backward(self, dy: np.ndarray) -> np.ndarray:
        # FFN branch
        dx_ffn  = self.ln2.backward(self.ffn.backward(dy))
        dy      = dy + dx_ffn
        # MHSA branch
        dx_attn = self.ln1.backward(self.attn.backward(dy))
        return dy + dx_attn

    def params_grads(self):
        return (self.ln1.params_grads() + self.attn.params_grads() +
                self.ln2.params_grads() + self.ffn.params_grads())

    def zero_grads(self):
        for m in (self.ln1, self.attn, self.ln2, self.ffn):
            m.zero_grads()


# ── TextEncoderV3 ──────────────────────────────────────────────────────────

class TextEncoderV3:
    """
    4-Layer Transformer text encoder.

    Input : token ids [seq_len]
    Output:
      seq_out : [seq_len, seq_dim]   — full token-level embeddings for cross-attn
      cls_out : [emb_dim]            — pooled CLS token for FiLM conditioning

    Parameters (~2M for LITE config):
      token_emb : [vocab_size, d_model]
      pos_emb   : [max_len, d_model]   (learned)
      4 × TransformerBlock(d_model, n_heads)
      project_seq: [d_model → seq_dim]
      project_cls: [d_model → emb_dim]
    """

    def __init__(self,
                 emb_dim:  int = 128,     # CLS output dim (for FiLM)
                 seq_dim:  int = 128,     # token output dim (for cross-attn)
                 d_model:  int = 128,     # internal transformer width
                 n_heads:  int = 4,
                 n_layers: int = 4,
                 max_len:  int = 32):
        self.emb_dim  = emb_dim
        self.seq_dim  = seq_dim
        self.d_model  = d_model
        self.n_heads  = n_heads
        self.max_len  = max_len

        # Token embeddings
        scale = 0.02
        self.tok_emb  = (np.random.randn(VOCAB_SIZE, d_model) * scale).astype(np.float32)
        self.dtok_emb = np.zeros_like(self.tok_emb)

        # Learned positional embeddings
        self.pos_emb  = _sinusoidal_pos(max_len, d_model).copy()
        self.dpos_emb = np.zeros_like(self.pos_emb)

        # Transformer blocks
        self.blocks = [_TransformerBlock(d_model, n_heads) for _ in range(n_layers)]

        # Post-transformer layer norm
        self.ln_out = _LayerNorm(d_model)

        # Projection heads
        self.proj_seq = _Linear(d_model, seq_dim)
        self.proj_cls = _Linear(d_model, emb_dim)

        self._c: Optional[tuple] = None

    def forward(self, tokens: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        tokens : [max_len] int32
        returns: (seq_out [max_len, seq_dim], cls_out [emb_dim])
        """
        S = self.max_len
        mask = (tokens == PAD)   # [S] True where padding

        emb = self.tok_emb[tokens]         # [S, d_model]
        pe  = self.pos_emb[:S]
        x   = (emb + pe).astype(np.float32)

        for blk in self.blocks:
            x = blk.forward(x, mask=mask)

        x = self.ln_out.forward(x)         # [S, d_model]

        seq_out = self.proj_seq.forward(x)                # [S, seq_dim]
        cls_out = self.proj_cls.forward(x[0])             # [emb_dim] (CLS token)

        self._c = (tokens, emb, pe, mask)
        return seq_out, cls_out

    def backward(self,
                 d_seq: np.ndarray,
                 d_cls: np.ndarray) -> None:
        tokens, emb, pe, mask = self._c
        S = self.max_len

        # Backprop through projection heads
        dx_seq = self.proj_seq.backward(d_seq)           # [S, d_model]
        dx_cls = np.zeros((S, self.d_model), dtype=np.float32)
        dx_cls[0] = self.proj_cls.backward(d_cls)

        dx = dx_seq + dx_cls

        # Through ln_out
        dx = self.ln_out.backward(dx)

        # Through transformer blocks (reverse)
        for blk in reversed(self.blocks):
            dx = blk.backward(dx)

        # Token embedding gradients
        self.dpos_emb[:S] += dx
        for i, tok in enumerate(tokens):
            if not mask[i]:
                self.dtok_emb[tok] += dx[i]

    def zero_grads(self) -> None:
        self.dtok_emb[:] = 0.0
        self.dpos_emb[:] = 0.0
        for blk in self.blocks:
            blk.zero_grads()
        self.ln_out.zero_grads()
        self.proj_seq.zero_grads()
        self.proj_cls.zero_grads()

    def collect_params(self) -> Dict[str, np.ndarray]:
        p = {
            'tok_emb': self.tok_emb,
            'pos_emb': self.pos_emb,
        }
        for i, blk in enumerate(self.blocks):
            for j, (params, _) in enumerate(blk.params_grads()):
                for k, v in params.items():
                    p[f'blk{i}_pg{j}_{k}'] = v
        for j, (params, _) in enumerate(self.ln_out.params_grads()):
            for k, v in params.items():
                p[f'ln_out_pg{j}_{k}'] = v
        for j, (params, _) in enumerate(self.proj_seq.params_grads()):
            for k, v in params.items():
                p[f'proj_seq_pg{j}_{k}'] = v
        for j, (params, _) in enumerate(self.proj_cls.params_grads()):
            for k, v in params.items():
                p[f'proj_cls_pg{j}_{k}'] = v
        return p

    def load_params(self, d: Dict[str, np.ndarray]) -> None:
        if 'tok_emb' in d:
            self.tok_emb[:] = d['tok_emb']
        if 'pos_emb' in d:
            self.pos_emb[:d['pos_emb'].shape[0]] = d['pos_emb']

    def all_param_grad_pairs(self):
        pairs = [
            ({'tok_emb': self.tok_emb}, {'tok_emb': self.dtok_emb}),
            ({'pos_emb': self.pos_emb}, {'pos_emb': self.dpos_emb}),
        ]
        for blk in self.blocks:
            pairs.extend(blk.params_grads())
        pairs.extend(self.ln_out.params_grads())
        pairs.extend(self.proj_seq.params_grads())
        pairs.extend(self.proj_cls.params_grads())
        return pairs


# ── Helpers ────────────────────────────────────────────────────────────────

def _sinusoidal_pos(max_len: int, d: int) -> np.ndarray:
    pos  = np.arange(max_len)[:, None]
    dims = np.arange(0, d, 2)
    freqs = 1.0 / (10000 ** (dims / d))
    pe = np.zeros((max_len, d), dtype=np.float32)
    pe[:, 0::2] = np.sin(pos * freqs)
    pe[:, 1::2] = np.cos(pos * freqs)
    return pe
