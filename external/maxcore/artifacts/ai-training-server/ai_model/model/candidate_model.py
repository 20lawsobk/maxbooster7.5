"""Separate software-DigitalGPU candidates; not production-checkpoint compatible.

HyperGPUBackend training_mode=True bypasses its autograd GEMMs. Deliberately
keep it False. Optional reference/autograd training uses existing backend custom
autograd. Manual transformer training and inference dispatch all numerical work,
including residual gradient accumulation and sampling, inside candidate_training.
Torch is storage/serialization in manual mode, not a numerical fallback.
"""
import torch
from torch import nn

from ai_model.gpu.candidate_training import CandidateTrainingBackend, array
from ai_model.model.candidate_tokenizer import CandidateByteTokenizer
from ai_model.model.sampling_context import sampling_context


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
        if not 1 <= max_new_tokens <= 256:
            raise ValueError("Candidate generation limit must be 1..256")
        ids = [self.tokenizer.bos_id] + self.tokenizer.encode(prompt)
        if len(ids) + max_new_tokens - 1 > self.context:
            raise ValueError(
                f"Full prompt plus generation budget exceeds {self.context}-byte context; "
                "no prompt truncation or inference performed")
        generated = []
        rng = self.backend.dispatch("rng", seed)
        if type(min_length) is not int or not 0 <= min_length <= 256:
            raise ValueError("min_length must be an integer in 0..256")
        for _ in range(max_new_tokens):
            window = ids
            if self.architecture == CandidateModel.architecture:
                window = [self.tokenizer.pad_id] * (self.context - len(window)) + window
            if self.architecture == CandidateTransformer.architecture:
                weights = {name: array(p) for name, p in self.named_parameters()}
                logits, _tape = self.backend.dispatch(
                    "transformer_forward", weights,
                    self.backend.dispatch("token_array", [window]))
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
        raw = self.tokenizer.decode_bytes(generated)
        return {"text": raw.decode("utf-8", errors="replace"), "bytes_hex": raw.hex(),
                "token_ids": generated, "smoke_only": getattr(self, "smoke_only", True)}

    @classmethod
    def load_candidate(cls, checkpoint):
        data = torch.load(checkpoint, map_location="cpu", weights_only=True)
        architectures = {cls.architecture: cls,
                         CandidateTransformer.architecture: CandidateTransformer}
        if data.get("architecture") not in architectures or type(data.get("smoke_only")) is not bool:
            raise ValueError("Unsupported candidate checkpoint")
        model = architectures[data["architecture"]]()
        model.load_state_dict(data["state_dict"], strict=True)
        model.smoke_only = data["smoke_only"]
        model.eval()
        return model


class CandidateTransformer(CandidateModel):
    """Trainable causal one-block transformer, 128-byte context, 32 channels.

    Uses existing HyperGPU attention, GEMM and layer-norm backward capabilities.
    Intentionally small and unreleased; no pretrained language capability.
    """
    context = 128
    architecture = "byte-causal-transformer-v1"

    def __init__(self, seed=1729):
        nn.Module.__init__(self)
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
            raise ValueError("Expected [batch, length<=128] tokens")
        positions = torch.arange(ids.shape[1]).expand(ids.shape[0], -1)
        x = self.backend.add(self.backend.embedding(self.embedding.weight, ids),
                             self.backend.embedding(self.position.weight, positions))
        x = self.backend.add(x, self.attention(self.norm1(x), causal=True))
        x = self.backend.add(x, self.contract(
            self.backend.tanh(self.hidden(self.norm2(x)))))
        return self.output(x)

    def forward(self, ids):
        return self.sequence_logits(ids)[:, -1, :]