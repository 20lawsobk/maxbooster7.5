"""Separate software-DigitalGPU candidates; not production-checkpoint compatible.

HyperGPUBackend training_mode=True bypasses its autograd GEMMs. Deliberately
keep it False. Optional reference/autograd training uses existing backend custom
autograd. Manual transformer training and inference dispatch all numerical work,
including residual gradient accumulation and sampling, inside candidate_training.
Torch is storage/serialization in manual mode, not a numerical fallback.
"""
import torch
from torch import nn

from ai_model.gpu.candidate_training import CandidateTrainingBackend, array, tensor
from ai_model.model.candidate_tokenizer import CandidateByteTokenizer
from ai_model.model.sampling_context import sampling_context
from ai_model.model.inference_budget import check_inference_budget


class CandidateEmbeddingStorage(nn.Module):
    def __init__(self, backend, count, width):
        super().__init__()
        self.weight = backend.parameter((count, width))


class CandidateModel(nn.Module):
    context = 8
    architecture = "byte-context-mlp-v2"

    def __init__(self, seed=1729):
        super().__init__()
        self.tokenizer = CandidateByteTokenizer()
        self.backend = CandidateTrainingBackend(seed)
        self.embedding = CandidateEmbeddingStorage(self.backend, 259, 8)
        self.hidden = self.backend.linear(self.context * 8, 32, bias=False)
        self.output = self.backend.linear(32, 259, bias=False)

    def forward(self, ids):
        if ids.ndim != 2 or ids.shape[1] != self.context:
            raise ValueError("Expected [batch, 8] token context")
        embedded = self.backend.embedding(self.embedding.weight, ids)
        return self.output(self.backend.tanh(self.hidden(embedded.flatten(1))))

    @torch.no_grad()
    def generate(self, prompt: str, max_new_tokens: int = 48, *, temperature=0.0,
                 top_p=1.0, top_k=1, repetition_penalty=1.0, min_length=0,
                 seed=None, snapshot_hash=None) -> dict:
        seed, snapshot_hash = sampling_context(seed, snapshot_hash, default_seed=1729)
        limit = 1024 if self.architecture == PublicContentTransformer.architecture else 256
        if type(max_new_tokens) is not int or not 1 <= max_new_tokens <= limit:
            raise ValueError(f"Candidate generation limit must be an integer in 1..{limit}")
        ids = [self.tokenizer.bos_id] + self.tokenizer.encode(prompt)
        if len(ids) + max_new_tokens - 1 > self.context:
            raise ValueError(
                f"Full prompt plus generation budget exceeds {self.context}-byte context; "
                "no prompt truncation or inference performed")
        generated = []
        rng = self.backend.dispatch("rng", seed)
        if type(min_length) is not int or not 0 <= min_length <= limit:
            raise ValueError(f"min_length must be an integer in 0..{limit}")
        # Immutable parameter views and K/V belong to this call only. A reload
        # creates another adapter; no request can inherit another request's state.
        incremental = self.architecture == PublicContentTransformer.architecture
        weights = {name: array(p) for name, p in self.named_parameters()} if incremental else None
        cache = None
        for _ in range(max_new_tokens):
            check_inference_budget()
            window = ids
            if self.architecture == CandidateModel.architecture:
                window = [self.tokenizer.pad_id] * (self.context - len(window)) + window
            if incremental:
                if cache is None:
                    logits, cache = self.backend.dispatch(
                        "transformer_prefill", weights,
                        self.backend.dispatch("token_array", [window]), self.model_config)
                else:
                    logits = self.backend.dispatch(
                        "transformer_decode", weights,
                        self.backend.dispatch("token_array", [[ids[-1]]]), cache, self.model_config)
                scores = logits[0, -1]
            elif self.architecture == CandidateTransformer.architecture:
                weights = {name: array(p) for name, p in self.named_parameters()}
                logits, _tape = self.backend.dispatch(
                    "transformer_forward", weights,
                    self.backend.dispatch("token_array", [window]), getattr(self, "model_config", None))
                scores = logits[0, -1]
            else:
                scores = array(self(torch.tensor([window], dtype=torch.long))[0])
            token = self.backend.dispatch("sample", scores, ids, len(generated), rng,
                                          temperature, top_p, top_k,
                                          repetition_penalty, min_length)
            if token == self.tokenizer.eos_id:
                break
            generated.append(token)
            ids.append(token)
        check_inference_budget()
        raw = self.tokenizer.decode_bytes(generated)
        return {"text": raw.decode("utf-8", errors="replace"), "bytes_hex": raw.hex(),
                "token_ids": generated, "smoke_only": getattr(self, "smoke_only", True)}

    @classmethod
    def load_candidate(cls, checkpoint):
        data = torch.load(checkpoint, map_location="cpu", weights_only=True)
        architectures = {cls.architecture: cls,
                         CandidateTransformer.architecture: CandidateTransformer,
                         PublicContentTransformer.architecture: PublicContentTransformer}
        if data.get("architecture") not in architectures or type(data.get("smoke_only")) is not bool:
            raise ValueError("Unsupported candidate checkpoint")
        model_type = architectures[data["architecture"]]
        if model_type is PublicContentTransformer:
            config = data.get("model_config")
            if not isinstance(config, dict) or set(config) != {"width", "layers", "heads", "expansion"}:
                raise ValueError("Missing or invalid public content model configuration")
            model = model_type(context=data.get("context_tokens", 1024), **config)
        else:
            model = (model_type(context=data.get("context_tokens", 128))
                     if model_type is CandidateTransformer else model_type())
        model.load_state_dict(data["state_dict"], strict=True)
        model.smoke_only = data["smoke_only"]
        model.eval()
        return model


class CandidateTransformer(CandidateModel):
    """Trainable causal one-block transformer, bounded byte context, 32 channels.

    Uses existing HyperGPU attention, GEMM and layer-norm backward capabilities.
    Intentionally small and unreleased; no pretrained language capability.
    """
    context = 128
    architecture = "byte-causal-transformer-v1"

    def __init__(self, seed=1729, context=128):
        nn.Module.__init__(self)
        if type(context) is not int or not 128 <= context <= 4096:
            raise ValueError("Candidate context must be an integer in 128..4096")
        self.context = context
        self.tokenizer = CandidateByteTokenizer()
        self.backend = CandidateTrainingBackend(seed)
        self.embedding = CandidateEmbeddingStorage(self.backend, 259, 32)
        self.position = CandidateEmbeddingStorage(self.backend, self.context, 32)
        self.norm1 = self.backend.layer_norm(32)
        self.attention = self.backend.flash_attention(32, 4)
        # Avoid mixed precision and torch bias arithmetic in backend linears.
        for layer in (self.attention.qkv_proj, self.attention.out_proj):
            layer.mixed_precision = False
            layer.register_parameter("bias", None)
        self.norm2 = self.backend.layer_norm(32)
        self.hidden = self.backend.linear(32, 64, bias=False)
        self.contract = self.backend.linear(64, 32, bias=False)
        self.output = self.backend.linear(32, 259, bias=False)

    def sequence_logits(self, ids):
        if ids.ndim != 2 or not 1 <= ids.shape[1] <= self.context:
            raise ValueError(f"Expected [batch, length<={self.context}] tokens")
        positions = torch.arange(ids.shape[1]).expand(ids.shape[0], -1)
        x = self.backend.add(self.backend.embedding(self.embedding.weight, ids),
                             self.backend.embedding(self.position.weight, positions))
        x = self.backend.add(x, self.attention(self.norm1(x), causal=True))
        x = self.backend.add(x, self.contract(
            self.backend.tanh(self.hidden(self.norm2(x)))))
        return self.output(x)

    def forward(self, ids):
        return self.sequence_logits(ids)[:, -1, :]


class PublicContentBlock(nn.Module):
    def __init__(self, backend, width, heads, expansion):
        super().__init__()
        self.norm1 = backend.layer_norm(width)
        self.attention = backend.flash_attention(width, heads)
        self.norm2 = backend.layer_norm(width)
        self.hidden = backend.linear(width, width * expansion, bias=False)
        self.contract = backend.linear(width * expansion, width, bias=False)


class PublicContentTransformer(CandidateTransformer):
    """Scalable byte language model trained directly from certified public streams.

    Capacity is configuration, not a claim of language quality. All inference and
    manual training arithmetic executes in the same dispatched software backend.
    Defaults fit a CPU host; bounded configuration prevents unbounded allocation.
    """
    architecture = "public-content-transformer-v2"

    def __init__(self, seed=1729, context=1024, width=256, layers=6, heads=8, expansion=4):
        nn.Module.__init__(self)
        values = {"width": width, "layers": layers, "heads": heads, "expansion": expansion}
        if (type(context) is not int or not 128 <= context <= 4096 or
                any(type(value) is not int for value in values.values()) or
                not 128 <= width <= 1024 or not 1 <= layers <= 16 or
                not 1 <= heads <= 32 or width % heads or not 1 <= expansion <= 8):
            raise ValueError("Invalid bounded public content transformer configuration")
        # Bound weights + gradients + Adam moments + tape (batch one). Large
        # callers must separately bound batch size; this estimate is conservative.
        parameters = 259 * width * 2 + context * width + layers * ((4 + 2 * expansion) * width * width + 4 * width)
        estimated_bytes = parameters * 24 + layers * (context * width * (20 + expansion) * 4 + heads * context * context * 16)
        if estimated_bytes > 8 * 1024 ** 3:
            raise ValueError("Public content transformer exceeds 8 GiB single-batch working budget")
        self.context, self.model_config = context, values
        self.estimated_training_bytes = estimated_bytes
        self.tokenizer = CandidateByteTokenizer()
        self.backend = CandidateTrainingBackend(seed)
        self.embedding = CandidateEmbeddingStorage(self.backend, 259, width)
        self.position = CandidateEmbeddingStorage(self.backend, context, width)
        # Unit-scale byte/position embeddings destabilize deeper residual stacks.
        self.embedding.weight = self.backend.parameter((259, width), scale=.02)
        self.position.weight = self.backend.parameter((context, width), scale=.02)
        self.blocks = nn.ModuleList([PublicContentBlock(self.backend, width, heads, expansion)
                                     for _ in range(layers)])
        self.output = self.backend.linear(width, 259, bias=False)

    generation_token_unit = "utf8_byte"

    def script_generation_budget(self, prompt, caption_length="optimal"):
        """Resolve a byte budget at the text-agent boundary, before inference.

        UTF-8 tokens measure bytes, not words. Leave full caller conditioning
        intact and fail explicitly when it leaves too little room for sections.
        The returned integer is passed unchanged to generate().
        """
        budgets = {"short": (384, 192), "optimal": (768, 256), "long": (1024, 512)}
        if caption_length not in budgets:
            raise ValueError("Byte-model caption length must be short, optimal or long")
        requested, minimum = budgets[caption_length]
        remaining = self.context - len(self.tokenizer.encode(prompt))
        if remaining < minimum:
            raise ValueError(f"Full script prompt leaves {remaining} generation bytes; "
                             f"{caption_length} requires at least {minimum}. "
                             "Increase model context or reduce explicit request context; no prompt truncation performed")
        return min(requested, remaining)

    def sequence_logits(self, ids):
        weights = {name: array(p) for name, p in self.named_parameters()}
        logits, _ = self.backend.dispatch("transformer_forward", weights, array(ids), self.model_config)
        return tensor(logits)
