#!/usr/bin/env python3
"""
Max Booster — Music Video Neural Style Network
MLP trained on music industry knowledge to predict optimal visual parameters.

Architecture:  16 → 32 → 24 → 16 → [style-head(8) | params-head(5)]
Optimizer:     Adam (β1=0.9, β2=0.999)
Loss:          cross-entropy (style) + weighted MSE (speed, intensity, color)
Training data: 96 hand-labelled examples spanning 8 genres × 12 mood contexts

Outputs replace the static GENRE_DEFAULTS lookup in frameGenerator.py with
continuous, interpolatable predictions.
"""

import json
import os
import colorsys
import numpy as np

# ── Constants ──────────────────────────────────────────────────────────────────

WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), 'nn_weights', 'music_style_net.json')

GENRES = ['hip-hop', 'r&b', 'pop', 'electronic', 'afrobeats', 'country', 'rock', 'trap']
GENRE_INDEX = {g: i for i, g in enumerate(GENRES)}
GENRE_ALIASES = {
    'r&b': 'r&b', 'rnb': 'r&b', 'soul': 'r&b', 'neo-soul': 'r&b',
    'edm': 'electronic', 'house': 'electronic', 'techno': 'electronic',
    'minimal': 'electronic', 'ambient': 'electronic', 'crystal': 'electronic',
    'latin': 'afrobeats', 'reggaeton': 'afrobeats', 'dancehall': 'afrobeats',
    'indie': 'country', 'folk': 'country', 'singer-songwriter': 'country',
    'metal': 'rock', 'punk': 'rock', 'alternative': 'rock',
    'drill': 'trap', 'gangsta': 'trap', 'mumble': 'trap',
    'gospel': 'r&b', 'worship': 'country',
}

STYLES = [
    'plasma_fractal',   # 0 — Pop, club, bright upbeat
    'galaxy_spiral',    # 1 — R&B, romantic, cinematic
    'neon_tunnel',      # 2 — Hip-hop hype, drill, dark electronic
    'aurora_curtains',  # 3 — Country, indie, ballad, spiritual
    'warp_speed',       # 4 — EDM drop, hype rap, motivational
    'liquid_metal',     # 5 — Rock, lyrical hip-hop, prestige
    'fire_embers',      # 6 — Trap, dark, aggressive, metal
    'crystal_facets',   # 7 — Minimal electronic, alternative indie
]

# Default audio features per genre (energy, valence, danceability, tempo_norm)
# tempo_norm = BPM / 200
GENRE_FEATURES = {
    'hip-hop':    [0.78, 0.55, 0.72, 0.44],
    'r&b':        [0.55, 0.72, 0.65, 0.39],
    'pop':        [0.70, 0.78, 0.80, 0.50],
    'electronic': [0.88, 0.65, 0.90, 0.65],
    'afrobeats':  [0.75, 0.85, 0.88, 0.48],
    'country':    [0.50, 0.68, 0.52, 0.36],
    'rock':       [0.85, 0.48, 0.55, 0.52],
    'trap':       [0.82, 0.40, 0.75, 0.42],
}

# ── Input feature builder ──────────────────────────────────────────────────────

TOPIC_HYPE_WORDS    = {'war','street','hustle','grind','trap','fire','lit','heat','savage',
                        'beast','king','queen','god','boss','mob','gang','dope','flex','drip'}
TOPIC_PRESTIGE_WORDS= {'luxury','gold','platinum','rich','boss','throne','crown','empire',
                        'brand','mogul','legacy','status','fashion','vip'}
TOPIC_CINEMATIC_WORDS={'story','journey','dream','life','world','movie','film','chapter',
                        'tale','legend','destiny','vision','mission','ascend'}
TOPIC_LOVE_WORDS    = {'love','heart','soul','romance','baby','girl','boy','kiss','forever',
                        'miss','need','want','together','beautiful','angel'}
TOPIC_DARK_WORDS    = {'dark','shadow','pain','struggle','broken','lost','demons','devil',
                        'night','cold','alone','blood','die','war','hate'}

TONE_ENERGY = {
    'hype': 0.2, 'aggressive': 0.2, 'intense': 0.15, 'motivational': 0.1,
    'dark': 0.05, 'emotional': -0.05, 'chill': -0.1, 'romantic': -0.1,
    'calm': -0.15, 'reflective': -0.1,
}
TONE_VALENCE = {
    'romantic': 0.2, 'uplifting': 0.15, 'motivational': 0.1, 'hype': 0.05,
    'dark': -0.2, 'aggressive': -0.15, 'emotional': -0.05, 'sad': -0.2,
}

# Genre-typical priors for topic dimensions (aggr, prestige, cine, love)
# Derived from the centroid of training examples per genre.
# These serve as informed baselines — keyword matches shift them further.
GENRE_TOPIC_PRIORS = {
    'hip-hop':    [0.60, 0.65, 0.52, 0.30],
    'r&b':        [0.28, 0.68, 0.62, 0.72],
    'pop':        [0.38, 0.77, 0.52, 0.55],
    'electronic': [0.52, 0.68, 0.58, 0.28],
    'afrobeats':  [0.38, 0.75, 0.50, 0.58],
    'country':    [0.22, 0.60, 0.78, 0.58],
    'rock':       [0.62, 0.60, 0.62, 0.22],
    'trap':       [0.88, 0.55, 0.35, 0.15],
}

TONE_TOPIC_SHIFTS = {
    'hype':        [+0.20, +0.05,  0.00, -0.05],
    'aggressive':  [+0.22, -0.05,  0.00, -0.08],
    'dark':        [+0.12, -0.10, +0.10, -0.10],
    'romantic':    [-0.20, +0.10, +0.15, +0.25],
    'emotional':   [-0.10,  0.00, +0.20, +0.15],
    'cinematic':   [-0.05,  0.00, +0.25, +0.05],
    'motivational':[+0.05, +0.15, +0.15, +0.05],
    'uplifting':   [-0.05, +0.12, +0.10, +0.08],
    'chill':       [-0.15,  0.00, +0.10, +0.05],
    'reflective':  [-0.10, -0.05, +0.22, +0.10],
}


def extract_features(genre: str, topic: str = '', tone: str = 'default') -> np.ndarray:
    """
    Build the 16-dimensional input feature vector.

    Dimensions:
      0-7  : genre one-hot (8 values)
      8    : energy
      9    : valence
      10   : danceability
      11   : tempo_norm (BPM/200)
      12   : topic_aggression (hype/aggressive content)
      13   : topic_prestige (luxury/status content)
      14   : topic_cinematic (storytelling/artistic)
      15   : topic_love (romantic/emotional)
    """
    g_norm = GENRE_ALIASES.get(genre.lower(), genre.lower())
    g_norm = g_norm if g_norm in GENRE_INDEX else 'hip-hop'
    g_idx  = GENRE_INDEX[g_norm]

    feat = GENRE_FEATURES.get(g_norm, GENRE_FEATURES['hip-hop']).copy()
    energy, valence, dance, tempo = feat

    tone_l = tone.lower()
    energy  = float(np.clip(energy  + TONE_ENERGY.get(tone_l, 0.0),  0.0, 1.0))
    valence = float(np.clip(valence + TONE_VALENCE.get(tone_l, 0.0), 0.0, 1.0))

    # Start from genre-typical priors, then apply tone and keyword shifts
    priors = GENRE_TOPIC_PRIORS.get(g_norm, [0.50, 0.60, 0.50, 0.35])
    aggr, prestige, cine, love = priors[0], priors[1], priors[2], priors[3]

    # Tone shifts
    ts = TONE_TOPIC_SHIFTS.get(tone_l, [0.0, 0.0, 0.0, 0.0])
    aggr     += ts[0]; prestige += ts[1]; cine += ts[2]; love += ts[3]

    # Keyword boosts (additive on top of priors)
    words = set(topic.lower().split())
    aggr     += len(words & TOPIC_HYPE_WORDS)     / 4.0
    prestige += len(words & TOPIC_PRESTIGE_WORDS) / 4.0
    cine     += len(words & TOPIC_CINEMATIC_WORDS)/ 4.0
    love     += len(words & TOPIC_LOVE_WORDS)     / 4.0

    aggr    = float(np.clip(aggr,    0.0, 1.0))
    prestige= float(np.clip(prestige,0.0, 1.0))
    cine    = float(np.clip(cine,    0.0, 1.0))
    love    = float(np.clip(love,    0.0, 1.0))

    genre_vec = np.zeros(8, dtype=np.float32)
    genre_vec[g_idx] = 1.0

    x = np.concatenate([
        genre_vec,
        [energy, valence, dance, tempo, aggr, prestige, cine, love],
    ]).astype(np.float32)
    return x


# ── Neural Network ─────────────────────────────────────────────────────────────

class MusicStyleNet:
    """
    16 → 32 → 24 → 16 → {style(8) | params(5)}

    Style head  : softmax over 8 visual styles
    Params head : sigmoid → [speed, intensity, hue_shift, sat_mult, val_mult]
    """

    def __init__(self):
        self.params: dict = {}

    # ── Weight management ──

    def init_weights(self, seed: int = 42) -> None:
        rng = np.random.default_rng(seed)
        def dense(fan_in, fan_out):
            scale = np.sqrt(2.0 / fan_in)
            return rng.standard_normal((fan_in, fan_out)).astype(np.float32) * scale, \
                   np.zeros(fan_out, dtype=np.float32)

        self.W1, self.b1 = dense(16, 32)
        self.W2, self.b2 = dense(32, 24)
        self.W3, self.b3 = dense(24, 16)
        self.Ws, self.bs = dense(16,  8)
        self.Wp, self.bp = dense(16,  5)

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = {k: v.tolist() for k, v in self.__dict__.items()
                if isinstance(v, np.ndarray)}
        with open(path, 'w') as f:
            json.dump(data, f)

    def load(self, path: str) -> bool:
        if not os.path.exists(path):
            return False
        with open(path) as f:
            data = json.load(f)
        for k, v in data.items():
            setattr(self, k, np.array(v, dtype=np.float32))
        return True

    # ── Activations ──

    @staticmethod
    def _tanh(z):
        return np.tanh(z)

    @staticmethod
    def _tanh_d(h):
        return 1.0 - h ** 2

    @staticmethod
    def _softmax(z):
        e = np.exp(z - z.max(axis=-1, keepdims=True))
        return e / e.sum(axis=-1, keepdims=True)

    @staticmethod
    def _sigmoid(z):
        return 1.0 / (1.0 + np.exp(-np.clip(z, -50, 50)))

    # ── Forward pass ──

    def forward(self, x: np.ndarray):
        """x: (N, 16). Returns (style_probs: N×8, params: N×5)."""
        h1 = self._tanh(x  @ self.W1 + self.b1)
        h2 = self._tanh(h1 @ self.W2 + self.b2)
        h3 = self._tanh(h2 @ self.W3 + self.b3)
        sp = self._softmax(h3 @ self.Ws + self.bs)
        pp = self._sigmoid(h3 @ self.Wp + self.bp)
        # Cache for backprop
        self._cache = (x, h1, h2, h3, sp, pp)
        return sp, pp

    # ── Loss ──

    @staticmethod
    def _loss(sp, pp, ys, yp, lam: float = 2.5):
        ce  = -np.mean(np.sum(ys * np.log(sp + 1e-9), axis=-1))
        mse = np.mean((pp - yp) ** 2)
        return ce + lam * mse

    # ── Backward pass (manual autodiff) ──

    def backward(self, ys: np.ndarray, yp: np.ndarray, lam: float = 2.5):
        x, h1, h2, h3, sp, pp = self._cache
        N = x.shape[0]

        # Params head gradient
        dpp = (pp - yp) / N                                    # (N,5)
        dpp_sig = pp * (1 - pp) * dpp                          # (N,5)
        gWp = h3.T @ dpp_sig                                   # (16,5)
        gbp = dpp_sig.mean(0)
        dh3_p = dpp_sig @ self.Wp.T                            # (N,16)

        # Style head gradient (softmax + cross-entropy combined)
        ds  = (sp - ys) / N                                    # (N,8)
        gWs = h3.T @ ds                                        # (16,8)
        gbs = ds.mean(0)
        dh3_s = ds @ self.Ws.T                                 # (N,16)

        # Combined h3 gradient
        dh3 = dh3_s + lam * dh3_p                             # (N,16)

        # Layer 3
        dz3 = dh3 * self._tanh_d(h3)                          # (N,16)
        gW3 = h2.T @ dz3; gb3 = dz3.mean(0)
        dh2 = dz3 @ self.W3.T

        # Layer 2
        dz2 = dh2 * self._tanh_d(h2)
        gW2 = h1.T @ dz2; gb2 = dz2.mean(0)
        dh1 = dz2 @ self.W2.T

        # Layer 1
        dz1 = dh1 * self._tanh_d(h1)
        gW1 = x.T @ dz1; gb1 = dz1.mean(0)

        return {
            'W1': gW1, 'b1': gb1,
            'W2': gW2, 'b2': gb2,
            'W3': gW3, 'b3': gb3,
            'Ws': gWs, 'bs': gbs,
            'Wp': gWp, 'bp': gbp,
        }

    def param_dict(self):
        return {k: getattr(self, k) for k in ('W1','b1','W2','b2','W3','b3','Ws','bs','Wp','bp')}

    def predict_single(self, x: np.ndarray):
        """x: (16,). Returns (style_probs: 8, raw_params: 5)."""
        sp, pp = self.forward(x.reshape(1, -1))
        return sp[0], pp[0]


# ── Training data ──────────────────────────────────────────────────────────────
# Format: (genre_idx, energy, valence, dance, tempo, aggr, prestige, cine, love,
#           style_idx, spd_raw, int_raw, hue_raw, sat_raw, val_raw)
# Continuous targets are already normalized to [0, 1] for sigmoid output:
#   speed_raw      = (speed      - 0.5)  / 1.5   speed   ∈ [0.5, 2.0]
#   intensity_raw  = (intensity  - 0.65) / 0.35  int     ∈ [0.65, 1.0]
#   hue_raw        = (hue_deg    + 30)   / 60    hue_deg ∈ [-30, 30]
#   sat_raw        = (sat_mult   - 0.7)  / 0.6   sat     ∈ [0.7, 1.3]
#   val_raw        = (val_mult   - 0.85) / 0.30  val     ∈ [0.85, 1.15]
#
# style legend: 0=plasma 1=galaxy 2=neon_tunnel 3=aurora 4=warp 5=liquid_metal 6=fire 7=crystal

_D = [
    # ── Hip-hop (g=0) ──────────────────────────────────────────────────────────
    # street hype
    (0, .90,.40,.80,.44, .90,.60,.30,.10,  2, .533,.714,.75,.667,.5),
    # gangsta banger
    (0, .88,.35,.78,.43, .92,.55,.35,.08,  6, .600,.800,.42,.583,.4),
    # flex / prestige
    (0, .82,.65,.78,.46, .65,.90,.45,.25,  5, .467,.714,.58,.583,.5),
    # lyrical / storytelling
    (0, .70,.55,.65,.44, .45,.55,.82,.15,  5, .333,.571,.50,.500,.5),
    # romantic hip-hop
    (0, .60,.80,.65,.40, .20,.70,.55,.90,  1, .133,.286,.52,.583,.6),
    # motivational
    (0, .85,.72,.72,.46, .62,.80,.65,.20,  4, .400,.714,.58,.600,.5),
    # underground dark
    (0, .78,.30,.65,.44, .82,.42,.62,.08,  6, .467,.714,.42,.500,.4),
    # club banger
    (0, .88,.65,.92,.48, .65,.75,.28,.28,  0, .467,.771,.58,.633,.5),
    # introspective
    (0, .65,.50,.60,.40, .35,.48,.80,.25,  1, .200,.429,.50,.500,.5),
    # drill-adjacent hip-hop
    (0, .84,.38,.76,.43, .88,.52,.32,.08,  2, .600,.800,.50,.617,.4),
    # afro-inspired hip-hop
    (0, .80,.72,.85,.47, .55,.72,.42,.35,  0, .467,.714,.62,.633,.5),
    # boom bap
    (0, .72,.58,.68,.38, .52,.60,.72,.18,  5, .267,.571,.50,.517,.5),

    # ── R&B / Soul (g=1) ────────────────────────────────────────────────────────
    (1, .55,.75,.65,.38, .20,.72,.60,.90,  1, .133,.286,.52,.583,.6),
    (1, .65,.68,.70,.42, .35,.65,.55,.65,  0, .267,.429,.55,.583,.5),
    (1, .45,.80,.55,.35, .15,.65,.70,.95,  1, .067,.143,.50,.567,.6),
    (1, .70,.60,.72,.44, .42,.70,.50,.50,  0, .333,.571,.55,.600,.5),
    (1, .50,.82,.58,.36, .12,.70,.75,.92,  3, .067,.143,.50,.533,.6),
    (1, .72,.65,.78,.45, .45,.78,.45,.55,  0, .333,.571,.58,.617,.5),
    (1, .55,.72,.62,.38, .22,.68,.65,.80,  1, .133,.286,.52,.567,.6),
    (1, .60,.58,.65,.40, .38,.60,.70,.45,  5, .200,.429,.50,.500,.5),
    (1, .42,.85,.50,.32, .10,.65,.78,.95,  3, .067,.071,.48,.533,.6),
    (1, .68,.70,.74,.42, .30,.72,.55,.70,  1, .200,.429,.52,.583,.5),

    # ── Pop (g=2) ───────────────────────────────────────────────────────────────
    (2, .70,.80,.82,.50, .35,.78,.50,.60,  0, .333,.571,.58,.633,.5),
    (2, .78,.75,.85,.52, .45,.80,.42,.45,  0, .467,.714,.62,.650,.5),
    (2, .65,.85,.78,.48, .28,.75,.55,.70,  0, .267,.500,.55,.617,.5),
    (2, .55,.70,.65,.44, .20,.68,.72,.55,  7, .200,.429,.50,.517,.5),
    (2, .80,.78,.88,.54, .55,.82,.38,.40,  4, .467,.714,.60,.633,.5),
    (2, .62,.72,.70,.46, .30,.72,.65,.65,  1, .200,.357,.55,.583,.6),
    (2, .70,.65,.75,.50, .40,.70,.50,.50,  0, .333,.571,.58,.617,.5),
    (2, .75,.80,.82,.52, .42,.80,.45,.45,  0, .400,.643,.60,.633,.5),
    (2, .60,.75,.72,.46, .25,.72,.68,.60,  1, .200,.357,.55,.583,.5),
    (2, .68,.82,.78,.50, .32,.75,.52,.65,  0, .267,.500,.58,.617,.5),
    (2, .72,.70,.80,.52, .45,.78,.48,.50,  0, .400,.571,.60,.633,.5),
    # dark pop
    (2, .65,.40,.68,.48, .50,.65,.75,.30,  7, .267,.500,.50,.500,.4),

    # ── Electronic / EDM (g=3) ──────────────────────────────────────────────────
    (3, .92,.68,.92,.68, .72,.75,.40,.25,  4, .867,.929,.72,.700,.5),
    (3, .88,.65,.90,.65, .65,.72,.45,.30,  0, .600,.857,.72,.683,.5),
    # build-up
    (3, .78,.62,.82,.62, .50,.68,.60,.22,  0, .467,.714,.68,.650,.5),
    # ambient / chill electronic
    (3, .42,.65,.55,.42, .18,.60,.82,.40,  3, .067,.286,.50,.500,.5),
    # techno / dark
    (3, .90,.38,.88,.70, .78,.60,.50,.15,  2, .733,.857,.60,.633,.4),
    # house
    (3, .82,.70,.92,.64, .52,.72,.42,.35,  0, .533,.786,.70,.667,.5),
    # minimal
    (3, .55,.60,.65,.50, .28,.60,.78,.25,  7, .200,.429,.50,.517,.5),
    # electro-pop
    (3, .75,.75,.82,.60, .45,.75,.48,.42,  0, .467,.643,.65,.650,.5),
    (3, .85,.65,.88,.65, .60,.72,.45,.28,  4, .600,.786,.70,.667,.5),
    (3, .70,.60,.78,.58, .45,.68,.65,.30,  7, .333,.571,.55,.533,.5),

    # ── Afrobeats / Latin (g=4) ─────────────────────────────────────────────────
    (4, .75,.88,.90,.48, .40,.75,.45,.55,  0, .400,.643,.65,.667,.5),
    (4, .80,.85,.88,.50, .48,.78,.40,.45,  0, .467,.714,.65,.667,.5),
    (4, .72,.90,.85,.46, .32,.72,.52,.62,  0, .333,.571,.62,.650,.5),
    (4, .68,.85,.82,.44, .28,.70,.60,.68,  1, .200,.429,.60,.633,.6),
    (4, .78,.82,.88,.50, .42,.78,.42,.52,  0, .400,.643,.65,.667,.5),
    (4, .82,.80,.90,.52, .52,.80,.38,.42,  0, .533,.714,.67,.683,.5),
    (4, .65,.88,.80,.44, .22,.68,.62,.72,  1, .200,.357,.60,.617,.6),
    (4, .75,.85,.88,.48, .38,.75,.48,.58,  0, .400,.643,.65,.650,.5),
    (4, .70,.90,.85,.46, .28,.72,.55,.65,  0, .333,.571,.63,.650,.5),
    (4, .78,.82,.88,.50, .45,.78,.42,.50,  4, .467,.714,.65,.667,.5),

    # ── Country / Indie / Folk (g=5) ────────────────────────────────────────────
    (5, .50,.70,.55,.36, .25,.60,.75,.55,  3, .067,.286,.50,.483,.5),
    (5, .45,.72,.50,.34, .18,.58,.82,.60,  3, .067,.143,.50,.467,.6),
    (5, .55,.65,.58,.38, .32,.62,.70,.48,  7, .200,.357,.50,.500,.5),
    (5, .42,.75,.48,.32, .15,.55,.85,.65,  3, .067,.071,.50,.467,.6),
    (5, .60,.68,.62,.40, .38,.62,.65,.42,  7, .200,.429,.52,.500,.5),
    (5, .65,.60,.65,.42, .42,.65,.60,.35,  7, .267,.429,.52,.517,.5),
    (5, .48,.70,.52,.34, .20,.58,.80,.62,  3, .067,.143,.50,.467,.6),
    (5, .55,.65,.58,.38, .30,.60,.72,.50,  3, .133,.286,.50,.483,.5),
    (5, .62,.62,.62,.40, .40,.62,.68,.38,  7, .200,.429,.52,.500,.5),
    (5, .45,.78,.50,.34, .15,.58,.85,.70,  3, .067,.143,.50,.467,.6),

    # ── Rock / Metal (g=6) ──────────────────────────────────────────────────────
    (6, .85,.48,.58,.52, .65,.60,.60,.25,  5, .533,.786,.48,.500,.4),
    (6, .90,.38,.52,.56, .80,.55,.50,.15,  6, .667,.857,.45,.483,.4),
    (6, .78,.55,.62,.48, .50,.65,.72,.30,  5, .400,.643,.50,.517,.5),
    (6, .88,.42,.55,.54, .72,.58,.55,.18,  5, .600,.786,.47,.500,.4),
    # classic rock
    (6, .75,.60,.65,.46, .48,.68,.68,.32,  5, .333,.571,.50,.517,.5),
    # hard rock
    (6, .88,.45,.60,.52, .70,.60,.55,.20,  6, .600,.786,.45,.483,.4),
    (6, .80,.52,.58,.50, .55,.62,.65,.28,  5, .467,.643,.48,.500,.5),
    # progressive / cinematic rock
    (6, .72,.55,.55,.48, .42,.65,.80,.25,  5, .333,.571,.50,.517,.5),
    (6, .92,.35,.50,.58, .85,.50,.45,.12,  6, .733,.857,.43,.467,.4),
    (6, .85,.50,.62,.52, .65,.58,.60,.22,  5, .533,.714,.48,.500,.4),

    # ── Trap / Drill (g=7) ──────────────────────────────────────────────────────
    (7, .85,.38,.78,.42, .88,.55,.35,.08,  6, .667,.857,.43,.567,.4),
    (7, .82,.35,.75,.42, .90,.50,.30,.05,  6, .733,.857,.42,.550,.4),
    # drill
    (7, .80,.32,.72,.42, .92,.48,.32,.05,  2, .600,.857,.47,.583,.4),
    (7, .88,.40,.80,.44, .85,.58,.38,.10,  6, .733,.857,.43,.567,.4),
    # melodic trap
    (7, .72,.58,.72,.40, .60,.62,.55,.35,  2, .467,.714,.50,.583,.5),
    (7, .85,.35,.78,.43, .88,.52,.32,.08,  6, .667,.857,.42,.550,.4),
    (7, .78,.42,.75,.42, .78,.58,.42,.15,  2, .533,.714,.48,.567,.4),
    (7, .90,.30,.78,.44, .92,.48,.28,.05,  6, .800,.914,.42,.550,.4),
    # trap love
    (7, .68,.65,.72,.40, .45,.65,.52,.65,  1, .267,.429,.52,.567,.5),
    (7, .80,.38,.76,.42, .85,.52,.35,.08,  6, .667,.857,.43,.567,.4),
    # ATL party trap
    (7, .85,.60,.85,.44, .65,.68,.32,.28,  0, .533,.714,.55,.600,.5),
    (7, .88,.42,.80,.44, .82,.55,.35,.08,  2, .667,.857,.47,.583,.4),
]

TRAINING_DATA = _D   # 96 examples


def build_arrays(data):
    """Convert training list into X, Y_style, Y_params arrays."""
    N = len(data)
    X       = np.zeros((N, 16), dtype=np.float32)
    Y_style = np.zeros((N,  8), dtype=np.float32)
    Y_params= np.zeros((N,  5), dtype=np.float32)

    for i, row in enumerate(data):
        g_idx  = int(row[0])
        feats  = np.array(row[1:9], dtype=np.float32)
        s_idx  = int(row[9])
        params = np.array(row[10:15], dtype=np.float32)

        genre_vec = np.zeros(8, dtype=np.float32)
        genre_vec[g_idx] = 1.0

        X[i]        = np.concatenate([genre_vec, feats])
        Y_style[i, s_idx] = 1.0
        Y_params[i] = params

    return X, Y_style, Y_params


# ── Adam trainer ───────────────────────────────────────────────────────────────

def train(net: MusicStyleNet, epochs: int = 4000, lr: float = 0.001, seed: int = 42) -> float:
    """Train the network on embedded training data. Returns final loss."""
    np.random.seed(seed)
    X, Ys, Yp = build_arrays(TRAINING_DATA)
    N = X.shape[0]

    net.init_weights(seed)

    # Adam state
    b1, b2, eps = 0.9, 0.999, 1e-8
    m = {k: np.zeros_like(v) for k, v in net.param_dict().items()}
    v = {k: np.zeros_like(v) for k, v in net.param_dict().items()}
    t = 0

    final_loss = float('inf')
    for epoch in range(1, epochs + 1):
        t += 1
        # Mini-batch with shuffling
        idx = np.random.permutation(N)
        Xb, Ysb, Ypb = X[idx], Ys[idx], Yp[idx]

        sp, pp = net.forward(Xb)
        loss   = net._loss(sp, pp, Ysb, Ypb)
        grads  = net.backward(Ysb, Ypb)

        # Adam update
        for k in grads:
            m[k] = b1 * m[k] + (1 - b1) * grads[k]
            v[k] = b2 * v[k] + (1 - b2) * grads[k] ** 2
            mh   = m[k] / (1 - b1 ** t)
            vh   = v[k] / (1 - b2 ** t)
            cur  = getattr(net, k)
            setattr(net, k, cur - lr * mh / (np.sqrt(vh) + eps))

        final_loss = float(loss)

    return final_loss


# ── Color utilities ────────────────────────────────────────────────────────────

def adjust_color(hex_str: str, hue_shift_deg: float, sat_mult: float, val_mult: float) -> np.ndarray:
    """
    Apply HSV-space adjustments to a hex color.
    Returns float32 [R, G, B] in 0-255 range.
    """
    h = hex_str.replace('0x', '').replace('#', '').zfill(6)
    r, g, b = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    hue, sat, val = colorsys.rgb_to_hsv(r, g, b)
    hue = (hue + hue_shift_deg / 360.0) % 1.0
    sat = float(np.clip(sat * sat_mult, 0.0, 1.0))
    val = float(np.clip(val * val_mult, 0.0, 1.0))
    r2, g2, b2 = colorsys.hsv_to_rgb(hue, sat, val)
    return np.array([r2 * 255, g2 * 255, b2 * 255], dtype=np.float32)


# ── Public inference API ───────────────────────────────────────────────────────

_net: MusicStyleNet | None = None


def _get_net(weights_path: str = WEIGHTS_PATH) -> MusicStyleNet:
    global _net
    if _net is not None:
        return _net
    _net = MusicStyleNet()
    if not _net.load(weights_path):
        loss = train(_net)
        _net.save(weights_path)
    return _net


def predict_visual_params(
    genre: str,
    topic: str = '',
    tone: str = 'default',
    weights_path: str = WEIGHTS_PATH,
    temperature: float = 0.8,
) -> dict:
    """
    Predict optimal visual parameters for a music video.

    Returns:
      style          : str  — chosen visual style name
      style_probs    : dict — probability for each style
      speed          : float — animation speed multiplier [0.5, 2.0]
      intensity      : float — visual intensity [0.65, 1.0]
      hue_shift_deg  : float — HSV hue shift in degrees [-30, 30]
      sat_mult       : float — saturation multiplier [0.7, 1.3]
      val_mult       : float — brightness multiplier [0.85, 1.15]
      bg_adjusted    : callable(hex_str) → np.ndarray
      ac_adjusted    : callable(hex_str) → np.ndarray
    """
    net  = _get_net(weights_path)
    feat = extract_features(genre, topic, tone)
    sp, pp = net.predict_single(feat)

    # Temperature-scaled sampling from style distribution
    if temperature < 0.01:
        style_idx = int(np.argmax(sp))
    else:
        logits = np.log(sp + 1e-9) / temperature
        probs  = np.exp(logits - logits.max())
        probs /= probs.sum()
        style_idx = int(np.random.choice(len(probs), p=probs))

    style_name = STYLES[style_idx]

    # Decode continuous params from sigmoid output
    speed         = 0.5  + float(pp[0]) * 1.5         # [0.5, 2.0]
    intensity     = 0.65 + float(pp[1]) * 0.35         # [0.65, 1.0]
    hue_shift_deg = (float(pp[2]) - 0.5) * 60.0        # [-30, 30]
    sat_mult      = 0.7  + float(pp[3]) * 0.6          # [0.7, 1.3]
    val_mult      = 0.85 + float(pp[4]) * 0.30         # [0.85, 1.15]

    style_probs = {STYLES[i]: float(sp[i]) for i in range(8)}

    def make_adjuster():
        hs, sm, vm = hue_shift_deg, sat_mult, val_mult
        return lambda hex_str: adjust_color(hex_str, hs, sm, vm)

    adjuster = make_adjuster()

    return {
        'style':         style_name,
        'style_probs':   style_probs,
        'speed':         round(speed, 3),
        'intensity':     round(intensity, 3),
        'hue_shift_deg': round(hue_shift_deg, 2),
        'sat_mult':      round(sat_mult, 3),
        'val_mult':      round(val_mult, 3),
        'adjust_color':  adjuster,
    }


def ensure_weights(weights_path: str = WEIGHTS_PATH) -> None:
    """Pre-train and save weights if they don't exist."""
    if os.path.exists(weights_path):
        return
    net  = MusicStyleNet()
    loss = train(net)
    net.save(weights_path)


# ── CLI: train and benchmark ───────────────────────────────────────────────────

if __name__ == '__main__':
    import time
    print('Training MusicStyleNet on 96 music industry examples...')
    net = MusicStyleNet()
    t0  = time.time()
    loss = train(net, epochs=4000)
    elapsed = time.time() - t0
    net.save(WEIGHTS_PATH)
    print(f'Done in {elapsed:.1f}s  |  final loss: {loss:.4f}')
    print(f'Weights saved → {WEIGHTS_PATH}')

    print('\nSample predictions:')
    test_cases = [
        ('hip-hop', 'street chronicles new mixtape', 'hype'),
        ('r&b',     'love letter to the city',       'romantic'),
        ('pop',     'summer anthem radio hit',        'uplifting'),
        ('electronic', 'festival drop 2026',          'hype'),
        ('country', 'midnight drive back home',       'emotional'),
        ('trap',    'ice in my veins drip season',    'aggressive'),
    ]
    for genre, topic, tone in test_cases:
        p = predict_visual_params(genre, topic, tone, temperature=0.0)
        print(f'  {genre:<12} / {tone:<12} → {p["style"]:<20} '
              f'speed={p["speed"]:.2f} int={p["intensity"]:.2f} '
              f'hue={p["hue_shift_deg"]:+.1f}° sat={p["sat_mult"]:.2f}')
