# AI Model Architecture

All AI in Max Booster is 100% custom-built in-house. No external AI APIs (OpenAI, Anthropic, Cohere, Replicate, etc.) are used. Every model is trained specifically for the music industry on quality-curated data.

## Model Directory Structure

```
ai_model/
├── model/
│   ├── transformer.py        — Core decoder-only Transformer (PyTorch)
│   ├── multi_head_model.py   — Multi-task architecture (shared backbone + agent heads)
│   ├── creative_model.py     — Generation wrapper (temperature, top_p, top_k)
│   └── tokenizer.py          — Custom tokenizer with music-domain control tokens
├── training/
│   ├── trainer.py            — Base training loop (AdamW, cosine LR decay)
│   └── synthetic.py          — Synthetic training data generation
├── agents/
│   ├── script_agent.py       — Social media script generation (Hook → Body → CTA)
│   ├── distribution_agent.py — Platform-specific caption + hashtag optimization
│   └── visual_spec_agent.py  — Thumbnail prompt + color scheme generation
├── gpu/
│   ├── digital_gpu.py        — Software-defined GPU (VRAM, SIMD cores, GEMM)
│   └── hyper_core.py         — Tensor core units (FP16/BF16, Flash Attention)
└── video/
    ├── cinematic_engine.py   — Promo video rendering engine
    └── templates_v2.py       — Video layout and transition templates
```

## Core Transformer Architecture (`transformer.py`)

A standard **Decoder-only Transformer** (autoregressive LM), implemented in PyTorch:

- **Architecture**: `TransformerLM` class with embedding layer, positional encoding, N × `TransformerDecoderLayer` blocks
- **Masking**: Causal masks for autoregressive (left-to-right) generation
- **Task**: Text generation — given a context prompt, generate the next tokens

## Multi-Head Architecture (`multi_head_model.py`)

Enables one backbone model to perform multiple distinct tasks by switching output heads:

```
Input Tokens
     │
     ▼
SharedBackbone (Transformer)
     │
     ├── AgentHead: Script Generation
     ├── AgentHead: Distribution Captions
     ├── AgentHead: Visual Spec
     └── AgentHead: [extensible]
```

This avoids training separate models for each task. The backbone learns shared music-domain representations; the heads specialize.

## Generation Parameters (`creative_model.py`)

The `CreativeModel` wrapper controls output diversity:

| Parameter | Effect |
|---|---|
| `temperature` | Randomness (higher = more creative, lower = more deterministic) |
| `top_p` | Nucleus sampling — only sample from top-P probability mass |
| `top_k` | Only sample from top-K most likely tokens |
| `repetition_penalty` | Discourage repeating the same phrases |

## Custom Tokenizer (`tokenizer.py`)

A `SimpleTokenizer` with a custom vocabulary designed for music industry content. Special control tokens allow the model to understand platform and stage context:

| Control Token | Meaning |
|---|---|
| `<PLATFORM_TIKTOK>` | Optimize output for TikTok |
| `<PLATFORM_INSTAGRAM>` | Optimize output for Instagram |
| `<PLATFORM_YOUTUBE>` | Optimize output for YouTube |
| `<STAGE_HOOK>` | Generate the opening hook |
| `<STAGE_BODY>` | Generate the main body |
| `<STAGE_CTA>` | Generate the call to action |

## Domain Agent Implementations

### Script Agent (`script_agent.py`)
Generates structured social media scripts in three parts:
- **Hook** — attention-grabbing opening
- **Body** — story/content delivery
- **CTA** — call to action

Includes fallback templates for reliability when the transformer is warming up.

### Distribution Agent (`distribution_agent.py`)
Generates platform-optimized captions, hashtag sets, and posting time recommendations for 8+ platforms. Understands platform-specific constraints (character limits, hashtag norms, algorithm preferences).

### Visual Spec Agent (`visual_spec_agent.py`)
Generates thumbnail prompts and defines color schemes, layouts, and typography guidance for album art and social thumbnails — all processed by the in-house AI.

## GPU Simulation Layer

### Digital GPU (`digital_gpu.py`)
A software-defined GPU providing:
- **VRAM management**: Virtual memory allocation and tracking
- **SIMD Core**: Single Instruction, Multiple Data operations
- **Tiled GEMM**: Tiled General Matrix Multiplication for transformer attention
- **Instruction Scheduler**: Batches and sequences operations for throughput

### Hyper GPU (`hyper_core.py`)
An advanced tier adding:
- **Tensor Core Units**: Mixed-precision (FP16/BF16) matrix multiplication — mirrors hardware Tensor Cores
- **Flash Attention**: Memory-efficient attention implementation that avoids materializing the full attention matrix

## Training Infrastructure

### Base Trainer (`training/trainer.py`)
- **Optimizer**: AdamW (weight decay regularization)
- **LR Schedule**: Cosine learning rate decay
- **Loss**: Cross-entropy over next-token prediction
- **Batching**: Configurable batch sizes

### Synthetic Data (`training/synthetic.py`)
Generates training samples programmatically to bootstrap model training before curated data is available. Music-domain synthetic samples include social scripts, distribution captions, and promotional copy structures.

## Video Rendering Engine (`video/`)

The cinematic rendering engine produces promotional music videos from generated scripts:
- **Input**: Script agent output + track metadata
- **Process**: Template selection → segment rendering → composition
- **Output**: Platform-specific variants (TikTok vertical, YouTube landscape, Instagram square)
- **Templates (`templates_v2.py`)**: Visual layout patterns with transition definitions

## TypeScript AI Services (Server Bridge)

### `pythonAIService.ts`
A singleton HTTP client that connects to the Python FastAPI server on port 9878:

| Method | Endpoint | Purpose |
|---|---|---|
| `generateScript()` | `/generate/script` | Social media script |
| `generateContent()` | `/generate/content` | General content |
| `createBoostSheet()` | `/boost-sheet` | Release promotion plan |
| `optimize()` | `/optimize` | Content optimization |
| `generateVideo()` | `/generate/video` | Promo video |

Includes health checks and timeouts — if the Python service is offline, the main app remains stable and falls back to local heuristic generators.

### `unifiedAIController.ts`
The orchestration layer that coordinates all AI subsystems:

| Engine | Purpose |
|---|---|
| `MLModelRegistry` | Model version management and inference tracking |
| `ContentGenerator` | Heuristic content fallback (when Python AI is unavailable) |
| `SentimentAnalyzer` | Tone and emotion analysis |
| `RecommendationEngine` | Personalized content and beat recommendations |
| `AdOptimizationEngine` | Campaign optimization without budget input |
| `SocialAutopilotEngine` | Autonomous posting strategy |

**Priority chain**: Python transformer → local heuristic generators → error

## Registered AI Models (Database)

| Model ID | Capability | Domain |
|---|---|---|
| `stem_separator_v1` | Source separation | Studio |
| `genre_preset_engine_v1` | Genre-specific mixing presets | Studio |
| `reference_matcher_v1` | Reference track analysis | Studio |
| `lufs_meter_v1` | Loudness compliance | Studio |
| `time_series_predictor_v1` | Stream/revenue forecasting | Analytics |
| `cohort_analyzer_v1` | User cohort retention | Analytics |
| `churn_predictor_v1` | At-risk user detection | Analytics |
| `revenue_forecaster_v1` | Future earnings projection | Analytics |
| `anomaly_detector_v1` | Metric spike/drop detection | Analytics |
| `content_multilingual_v1` | Multi-language content generation | Social |
| `brand_voice_analyzer_v1` | Artist voice consistency | Social |
| `trend_detector_v1` | Viral trend detection | Social |
| `hashtag_optimizer_v1` | Platform-specific hashtag ranking | Social |

## In-House Audio AI (`aiMusicService.ts`)

Separate from the transformer models, the audio AI services use signal processing algorithms implemented in TypeScript:

| Feature | Implementation |
|---|---|
| Stem separation | Confidence-scored FFT separation (vocals, drums, bass, melody, harmony) |
| Loudness measurement | LUFS via FFmpeg — Spotify (-14 LUFS), Apple (-16 LUFS), YouTube (-13 LUFS) |
| Genre presets | Mixing/mastering presets for 20+ genres |
| Audio analysis | BPM, key, mood, energy, danceability, valence detection |
| Reference matching | Spectral profiles, dynamic range, stereo width analysis |
| Multiband compression | Per-band settings, stereo imaging, saturation control |
| Audio fingerprinting | SHA-256 segment hashing, 3 algorithm modes (chromaprint, acoustid, maxbooster) |

### Fingerprint Similarity Thresholds
| Match Type | Score |
|---|---|
| Exact duplicate | 0.98 |
| Near duplicate | 0.90 |
| Similar | 0.75 |
| Partial match | 0.50 |

## `advancedSocialAIService.ts` — Platform Knowledge Base

This service operates at what the platform describes as GPT-5.2-equivalent quality for social content, implemented entirely in-house:

| Platform | Char Limit | Hashtags | Hook Weight | Viral Multiplier |
|---|---|---|---|---|
| Twitter/X | 280 | 1–3 | 0.90 | 0.85 |
| Instagram | 2,200 | 5–15 | 0.70 | 0.75 |
| TikTok | 2,200 | 3–5 | 0.95 | 0.95 |
| YouTube | 5,000 | 3–15 | 0.80 | 0.90 |
| LinkedIn | 3,000 | 1–5 | 0.75 | 0.60 |
| Facebook | 63,206 | 1–3 | 0.70 | 0.65 |
