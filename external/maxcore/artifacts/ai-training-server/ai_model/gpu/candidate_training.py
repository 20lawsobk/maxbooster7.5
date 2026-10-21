"""Candidate-only DigitalGPU software kernels, with explicit operation dispatch.

These are implemented host NumPy kernels, not physical GPU acceleration or
pretend calls to unavailable hardware. Torch is storage/autograd orchestration;
the numerical kernels below execute inside this backend. Existing HyperGPU GEMM,
attention and normalization remain in the existing backend.
"""
from collections import Counter
from ai_model.model.inference_budget import check_inference_budget
import numpy as np
import torch

from ai_model.gpu.hyper_backend import HyperGPUBackend, HyperGPULinear, HyperFlashAttention, HyperLayerNorm
from ai_model.gpu.hyper_core import PrecisionMode


def array(tensor):
    if tensor.device.type != "cpu":
        raise ValueError("Candidate software backend requires CPU storage")
    return tensor.detach().numpy()


def tensor(value):
    return torch.from_numpy(np.asarray(value, dtype=np.float32))


class CandidateTrainingBackend(HyperGPUBackend):
    def __init__(self, seed=1729):
        super().__init__(lanes=4, tensor_cores=1, precision=PrecisionMode.FP32,
                         training_mode=False)
        self.dispatch_counts = Counter()
        self.initializer_rng = np.random.default_rng(seed)

    def dispatch(self, operation, *args):
        """Only implemented kernels are dispatchable; unsupported ops fail."""
        kernels = {
            "embedding": lambda weight, ids: weight[ids].copy(),
            "embedding_backward": self._embedding_backward,
            "tanh": np.tanh,
            "tanh_backward": lambda output, grad: grad * (1 - output * output),
            "add": np.add,
            "add_backward": lambda grad: (grad.copy(), grad.copy()),
            "cross_entropy": self._cross_entropy,
            "cross_entropy_backward": lambda grad, upstream: grad * upstream,
            "sgd": self._sgd,
            "adamw": self._adamw,
            "finite": lambda value: bool(np.isfinite(value).all()),
            "equal": np.array_equal,
            "greedy": self._greedy,
            "sample": self._sample,
            "rng": lambda seed: np.random.default_rng(seed),
            "token_array": lambda ids: np.asarray(ids, dtype=np.int64),
            "initialize": self._initialize,
            "transformer_forward": self._transformer_forward,
            "transformer_prefill": self._transformer_prefill,
            "transformer_decode": self._transformer_decode,
            "transformer_backward": self._transformer_backward,
        }
        if operation not in kernels:
            raise NotImplementedError(f"Unsupported candidate kernel: {operation}")
        result = kernels[operation](*args)
        self.dispatch_counts[operation] += 1
        return result

    def _initialize(self, shape, kind, scale=1.0):
        if kind == "normal":
            return (self.initializer_rng.standard_normal(shape) * scale).astype(np.float32)
        if kind == "ones":
            return np.ones(shape, dtype=np.float32)
        if kind == "zeros":
            return np.zeros(shape, dtype=np.float32)
        raise NotImplementedError("Unsupported initializer")

    def parameter(self, shape, kind="normal", scale=1.0):
        return torch.nn.Parameter(tensor(self.dispatch("initialize", shape, kind, scale)))

    def linear(self, in_features, out_features, bias=True, mixed_precision=False):
        # Construct storage without HyperGPULinear's torch.randn initialization.
        layer = HyperGPULinear.__new__(HyperGPULinear)
        torch.nn.Module.__init__(layer)
        layer.in_features, layer.out_features = in_features, out_features
        layer.gpu, layer.mixed_precision, layer._training_mode = self.gpu, mixed_precision, False
        layer.weight = self.parameter((in_features, out_features), scale=(2 / (in_features + out_features)) ** 0.5)
        layer.register_parameter("bias", self.parameter((out_features,), "zeros") if bias else None)
        return layer

    def layer_norm(self, dim, eps=1e-5):
        layer = HyperLayerNorm.__new__(HyperLayerNorm)
        torch.nn.Module.__init__(layer)
        layer.gpu, layer.eps, layer.dim, layer._training_mode = self.gpu, eps, dim, False
        layer.gamma = self.parameter((dim,), "ones")
        layer.beta = self.parameter((dim,), "zeros")
        return layer

    def flash_attention(self, dim, n_heads, block_size=64):
        layer = HyperFlashAttention.__new__(HyperFlashAttention)
        torch.nn.Module.__init__(layer)
        layer.dim, layer.n_heads, layer.head_dim = dim, n_heads, dim // n_heads
        layer.gpu, layer.block_size, layer._training_mode = self.gpu, block_size, False
        layer.qkv_proj = self.linear(dim, dim * 3, bias=False)
        layer.out_proj = self.linear(dim, dim, bias=False)
        return layer

    @staticmethod
    def _embedding_backward(shape, ids, grad):
        result = np.zeros(shape, dtype=np.float32)
        np.add.at(result, ids.reshape(-1), grad.reshape(-1, shape[-1]))
        return result

    @staticmethod
    def _cross_entropy(logits, targets):
        if logits.ndim != 2 or targets.shape != logits.shape[:1]:
            raise ValueError("Cross entropy expects [N,V] and [N]")
        if len(targets) == 0 or np.any(targets < 0) or np.any(targets >= logits.shape[1]):
            raise ValueError("Invalid targets")
        shifted = logits - logits.max(axis=-1, keepdims=True)
        exp = np.exp(shifted)
        denominator = exp.sum(axis=-1, keepdims=True)
        loss = (np.log(denominator[:, 0]) - shifted[np.arange(len(targets)), targets]).mean()
        gradient = exp / denominator
        gradient[np.arange(len(targets)), targets] -= 1
        gradient /= len(targets)
        return np.asarray(loss, dtype=np.float32), gradient

    @staticmethod
    def _sgd(weight, grad, lr):
        if not np.isfinite(lr) or not 0 < lr <= 1:
            raise ValueError("SGD learning rate must be in (0,1]")
        if not np.isfinite(grad).all() or not np.isfinite(weight).all():
            raise ValueError("Nonfinite optimizer input")
        updated = weight - np.float32(lr) * grad
        if not np.isfinite(updated).all():
            raise ValueError("Nonfinite optimizer update")
        return updated

    @staticmethod
    def _adamw(weights, gradients, state, lr, max_grad_norm, weight_decay):
        if (not np.isfinite(lr) or not 0 < lr <= 1 or
                not np.isfinite(max_grad_norm) or max_grad_norm <= 0 or
                not np.isfinite(weight_decay) or not 0 <= weight_decay <= 1):
            raise ValueError("Invalid AdamW configuration")
        if set(weights) != set(gradients):
            raise ValueError("Missing optimizer gradient")
        step = state.get("step", 0)
        if type(step) is not int or step < 0:
            raise ValueError("Invalid optimizer step")
        previous_m, previous_v = state.get("m", {}), state.get("v", {})
        if step and (set(previous_m) != set(weights) or set(previous_v) != set(weights)):
            raise ValueError("Incomplete optimizer state")
        norm_squared = 0.0
        for name, weight in weights.items():
            grad = gradients[name]
            if weight.shape != grad.shape or not np.isfinite(weight).all() or not np.isfinite(grad).all():
                raise ValueError("Invalid optimizer parameter or gradient")
            norm_squared += float(np.sum(grad.astype(np.float64) ** 2))
        scale = min(1.0, max_grad_norm / (np.sqrt(norm_squared) + 1e-12))
        updates, moments, variances = {}, {}, {}
        for name, weight in weights.items():
            grad = gradients[name] * np.float32(scale)
            m = array(previous_m[name]) if name in previous_m else np.zeros_like(weight)
            v = array(previous_v[name]) if name in previous_v else np.zeros_like(weight)
            if m.shape != weight.shape or v.shape != weight.shape or not np.isfinite(m).all() or not np.isfinite(v).all() or np.any(v < 0):
                raise ValueError("Invalid optimizer moments")
            m = np.float32(.9) * m + np.float32(.1) * grad
            v = np.float32(.999) * v + np.float32(.001) * grad * grad
            updated = weight * np.float32(1 - lr * weight_decay) - np.float32(lr) * (m / (1 - .9 ** (step + 1))) / (np.sqrt(v / (1 - .999 ** (step + 1))) + np.float32(1e-8))
            if not np.isfinite(updated).all():
                raise ValueError("Nonfinite optimizer update")
            updates[name], moments[name], variances[name] = updated, tensor(m), tensor(v)
        return updates, {"step": step + 1, "m": moments, "v": variances}

    @staticmethod
    def _greedy(logits, banned):
        result = logits.copy()
        result[list(banned)] = -np.inf
        return int(np.argmax(result))

    @staticmethod
    def _sample(logits, history, generated, rng, temperature, top_p, top_k,
                repetition_penalty, min_length, eos=258):
        if (not np.isfinite(temperature) or temperature < 0 or
                not np.isfinite(top_p) or not 0 < top_p <= 1 or
                type(top_k) is not int or not 0 <= top_k <= len(logits) or
                not np.isfinite(repetition_penalty) or repetition_penalty <= 0 or
                type(min_length) is not int or min_length < 0):
            raise ValueError("Invalid sampling parameters")
        scores = logits.astype(np.float64, copy=True)
        if not np.isfinite(scores).all():
            raise ValueError("Nonfinite sampling logits")
        for token in set(history):
            if 0 <= token < 256:
                scores[token] = (scores[token] * repetition_penalty if scores[token] < 0
                                 else scores[token] / repetition_penalty)
        scores[[256, 257]] = -np.inf
        if generated < min_length:
            scores[eos] = -np.inf
        if temperature == 0:
            return int(np.argmax(scores))
        scores /= temperature
        order = np.argsort(-scores, kind="stable")
        if top_k:
            order = order[:top_k]
        selected = scores[order]
        probabilities = np.exp(selected - selected.max())
        probabilities /= probabilities.sum()
        # Include the first token crossing top_p, never an empty nucleus.
        count = min(len(order), int(np.searchsorted(np.cumsum(probabilities), top_p)) + 1)
        order, probabilities = order[:count], probabilities[:count]
        probabilities /= probabilities.sum()
        return int(rng.choice(order, p=probabilities))

    def _linear(self, x, weight):
        out = self.gpu.gemm(x.reshape(-1, x.shape[-1]), weight)
        return out.reshape(*x.shape[:-1], weight.shape[-1])

    def _linear_backward(self, x, weight, grad):
        g = grad.reshape(-1, grad.shape[-1])
        dx = self.gpu.gemm(g, weight.T).reshape(x.shape)
        dw = self.gpu.gemm(x.reshape(-1, x.shape[-1]).T, g)
        return dx, dw

    def _norm(self, x, gamma, beta):
        centered = x - x.mean(axis=-1, keepdims=True)
        std = np.sqrt((centered * centered).mean(axis=-1, keepdims=True) + 1e-5)
        normalized = centered / std
        return self.gpu.layer_norm(x, gamma, beta, eps=1e-5), (normalized, std)

    @staticmethod
    def _norm_backward(grad, gamma, cache):
        normalized, std = cache
        g = grad * gamma
        dx = (g - g.mean(axis=-1, keepdims=True)
              - normalized * (g * normalized).mean(axis=-1, keepdims=True)) / std
        axes = tuple(range(grad.ndim - 1))
        return dx, (grad * normalized).sum(axis=axes), grad.sum(axis=axes)

    def _transformer_forward(self, w, ids, config=None):
        """Causal multiblock reverse-mode tape; v1 retains its parameter layout."""
        context = w["position.weight"].shape[0]
        if ids.ndim != 2 or not 1 <= ids.shape[1] <= context <= 4096:
            raise ValueError("Manual transformer exceeds the checkpoint context bound")
        if np.any(ids < 0) or np.any(ids >= 259):
            raise ValueError("Invalid token ID")
        if "blocks.0.norm1.gamma" in w and config is None:
            raise ValueError("Public content forward requires explicit model configuration")
        config = config or {"heads": 4, "layers": 1}
        heads, layers = config["heads"], config["layers"]
        width = w["embedding.weight"].shape[1]
        if width % heads:
            raise ValueError("Attention width must be divisible by heads")
        batch, length = ids.shape
        head_dim = width // heads
        # Backward attention materializes scores; bound actual batch as well as
        # checkpoint construction before allocating the training tape.
        expansion = config.get("expansion", 2)
        working_bytes = sum(value.nbytes for value in w.values()) * 6 + batch * layers * (length * width * (20 + expansion) * 4 + heads * length * length * 16)
        if working_bytes > 8 * 1024 ** 3:
            raise ValueError("Transformer batch exceeds 8 GiB working budget")
        positions = np.broadcast_to(np.arange(length), ids.shape)
        x = self.dispatch("add", self.dispatch("embedding", w["embedding.weight"], ids),
                          self.dispatch("embedding", w["position.weight"], positions))
        blocks = []
        for index in range(layers):
            check_inference_budget()
            prefix = f"blocks.{index}." if "blocks.0.norm1.gamma" in w else ""
            get = lambda name: w[prefix + name]
            n1, nc1 = self._norm(x, get("norm1.gamma"), get("norm1.beta"))
            qkv = self._linear(n1, get("attention.qkv_proj.weight"))
            q, k, v = [np.ascontiguousarray(part.reshape(batch, length, heads, head_dim)
                        .transpose(0, 2, 1, 3).reshape(batch * heads, length, head_dim))
                       for part in np.split(qkv, 3, axis=-1)]
            attention = self.gpu.flash_attention(q, k, v, causal=True, block_size=64)
            merged = attention.reshape(batch, heads, length, head_dim).transpose(0, 2, 1, 3).reshape(batch, length, width)
            y = self.dispatch("add", x, self._linear(merged, get("attention.out_proj.weight")))
            n2, nc2 = self._norm(y, get("norm2.gamma"), get("norm2.beta"))
            hidden = self.dispatch("tanh", self._linear(n2, get("hidden.weight")))
            x = self.dispatch("add", y, self._linear(hidden, get("contract.weight")))
            blocks.append({"prefix": prefix, "n1": n1, "nc1": nc1, "q": q, "k": k,
                           "v": v, "merged": merged, "n2": n2, "nc2": nc2, "hidden": hidden})
        logits = self._linear(x, w["output.weight"])
        return logits, {"ids": ids, "positions": positions, "blocks": blocks,
                        "heads": heads, "width": width, "z": x}

    def _transformer_prefill(self, w, ids, config):
        """V2 inference only: retain bounded K/V, never the reverse-mode tape.

        The returned cache belongs to this backend and this request's parameter
        views. Earlier hidden states cannot change under causal attention, so a
        later one-token decode can reuse their keys and values exactly.
        """
        if not isinstance(config, dict) or "blocks.0.norm1.gamma" not in w:
            raise ValueError("Incremental inference requires public content configuration")
        context, width = w["position.weight"].shape
        heads, layers = config["heads"], config["layers"]
        if (ids.ndim != 2 or ids.shape[0] < 1 or not 1 <= ids.shape[1] <= context <= 4096
                or not np.issubdtype(ids.dtype, np.integer)
                or np.any(ids < 0) or np.any(ids >= 259)
                or type(heads) is not int or heads < 1 or width % heads
                or type(layers) is not int or layers < 1):
            raise ValueError("Invalid bounded incremental transformer input")
        batch, length = ids.shape
        head_dim = width // heads
        # Include full-capacity K/V plus conservative prefill working storage.
        working_bytes = (sum(value.nbytes for value in w.values()) * 2
                         + 2 * batch * layers * context * width * 4
                         + batch * layers * (length * width * (20 + config["expansion"]) * 4
                                             + heads * length * length * 16))
        if working_bytes > 8 * 1024 ** 3:
            raise ValueError("Incremental transformer exceeds 8 GiB working budget")
        positions = np.broadcast_to(np.arange(length), ids.shape)
        x = self.dispatch("add", self.dispatch("embedding", w["embedding.weight"], ids),
                          self.dispatch("embedding", w["position.weight"], positions))
        blocks = []
        for index in range(layers):
            check_inference_budget()
            prefix = f"blocks.{index}."
            get = lambda name: w[prefix + name]
            n1 = self.gpu.layer_norm(x, get("norm1.gamma"), get("norm1.beta"), eps=1e-5)
            qkv = self._linear(n1, get("attention.qkv_proj.weight"))
            q, k, v = [np.ascontiguousarray(part.reshape(batch, length, heads, head_dim)
                        .transpose(0, 2, 1, 3).reshape(batch * heads, length, head_dim))
                       for part in np.split(qkv, 3, axis=-1)]
            key = np.empty((batch * heads, context, head_dim), dtype=np.float32)
            value = np.empty_like(key)
            key[:, :length], value[:, :length] = k, v
            blocks.append({"k": key, "v": value})
            attention = self.gpu.flash_attention(q, k, v, causal=True, block_size=64)
            merged = attention.reshape(batch, heads, length, head_dim).transpose(0, 2, 1, 3).reshape(batch, length, width)
            y = self.dispatch("add", x, self._linear(merged, get("attention.out_proj.weight")))
            n2 = self.gpu.layer_norm(y, get("norm2.gamma"), get("norm2.beta"), eps=1e-5)
            hidden = self.dispatch("tanh", self._linear(n2, get("hidden.weight")))
            x = self.dispatch("add", y, self._linear(hidden, get("contract.weight")))
        cache = {"owner": self, "weight_ids": tuple((name, id(value)) for name, value in w.items()),
                 "config": dict(config), "batch": batch, "length": length,
                 "context": context, "width": width, "blocks": blocks}
        return self._linear(x[:, -1:], w["output.weight"]), cache

    def _transformer_decode(self, w, ids, cache, config):
        """Append one token at its absolute position using request-local K/V."""
        if (cache.get("owner") is not self or cache.get("config") != config
                or cache.get("weight_ids") != tuple((name, id(value)) for name, value in w.items())):
            raise ValueError("Incremental cache does not belong to these model views")
        batch, position = cache["batch"], cache["length"]
        width, heads = cache["width"], config["heads"]
        if (ids.shape != (batch, 1) or not np.issubdtype(ids.dtype, np.integer)
                or np.any(ids < 0) or np.any(ids >= 259)
                or not 1 <= position < cache["context"]):
            raise ValueError("Decode token or checkpoint context bound invalid")
        head_dim = width // heads
        positions = np.full((batch, 1), position, dtype=np.int64)
        x = self.dispatch("add", self.dispatch("embedding", w["embedding.weight"], ids),
                          self.dispatch("embedding", w["position.weight"], positions))
        for index, block in enumerate(cache["blocks"]):
            check_inference_budget()
            prefix = f"blocks.{index}."
            get = lambda name: w[prefix + name]
            n1 = self.gpu.layer_norm(x, get("norm1.gamma"), get("norm1.beta"), eps=1e-5)
            qkv = self._linear(n1, get("attention.qkv_proj.weight"))
            q, k, v = [np.ascontiguousarray(part.reshape(batch, 1, heads, head_dim)
                        .transpose(0, 2, 1, 3).reshape(batch * heads, 1, head_dim))
                       for part in np.split(qkv, 3, axis=-1)]
            block["k"][:, position:position + 1] = k
            block["v"][:, position:position + 1] = v
            # All retained keys are at or before this final query position.
            # A zero-origin triangular mask would incorrectly hide the prefix.
            attention = self.gpu.flash_attention(q, block["k"][:, :position + 1],
                                                  block["v"][:, :position + 1],
                                                  causal=False, block_size=64)
            merged = attention.reshape(batch, heads, 1, head_dim).transpose(0, 2, 1, 3).reshape(batch, 1, width)
            y = self.dispatch("add", x, self._linear(merged, get("attention.out_proj.weight")))
            n2 = self.gpu.layer_norm(y, get("norm2.gamma"), get("norm2.beta"), eps=1e-5)
            hidden = self.dispatch("tanh", self._linear(n2, get("hidden.weight")))
            x = self.dispatch("add", y, self._linear(hidden, get("contract.weight")))
        logits = self._linear(x, w["output.weight"])
        cache["length"] = position + 1
        return logits

    def _attention_backward(self, q, k, v, grad):
        scale = np.float32(1 / np.sqrt(q.shape[-1]))
        scores = self.gpu.gemm_batched(q, k.transpose(0, 2, 1)) * scale
        mask = np.triu(np.ones(scores.shape[-2:], dtype=bool), 1)
        scores = np.where(mask, -np.inf, scores)
        probabilities = np.exp(scores - scores.max(axis=-1, keepdims=True))
        probabilities /= probabilities.sum(axis=-1, keepdims=True)
        dv = self.gpu.gemm_batched(probabilities.transpose(0, 2, 1), grad)
        dp = self.gpu.gemm_batched(grad, v.transpose(0, 2, 1))
        ds = probabilities * (dp - (dp * probabilities).sum(axis=-1, keepdims=True)) * scale
        dq = self.gpu.gemm_batched(ds, k)
        dk = self.gpu.gemm_batched(ds.transpose(0, 2, 1), q)
        return dq, dk, dv

    def _transformer_backward(self, w, tape, grad):
        """Reverse every block, accumulating both residual branches before embeddings."""
        result = {}
        dx, result["output.weight"] = self._linear_backward(tape["z"], w["output.weight"], grad)
        batch, length = tape["ids"].shape
        heads, width = tape["heads"], tape["width"]
        head_dim = width // heads
        for block in reversed(tape["blocks"]):
            prefix = block["prefix"]
            get = lambda name: w[prefix + name]
            local = {}
            dh, local["contract.weight"] = self._linear_backward(block["hidden"], get("contract.weight"), dx)
            dh = self.dispatch("tanh_backward", block["hidden"], dh)
            dn2, local["hidden.weight"] = self._linear_backward(block["n2"], get("hidden.weight"), dh)
            dy2, local["norm2.gamma"], local["norm2.beta"] = self._norm_backward(dn2, get("norm2.gamma"), block["nc2"])
            dy = self.dispatch("add", dx, dy2)
            merged_grad, local["attention.out_proj.weight"] = self._linear_backward(block["merged"], get("attention.out_proj.weight"), dy)
            attention_grad = merged_grad.reshape(batch, length, heads, head_dim).transpose(0, 2, 1, 3).reshape(batch * heads, length, head_dim)
            head_grads = self._attention_backward(block["q"], block["k"], block["v"], attention_grad)
            qkv_grad = np.concatenate([g.reshape(batch, heads, length, head_dim).transpose(0, 2, 1, 3).reshape(batch, length, width) for g in head_grads], axis=-1)
            dn1, local["attention.qkv_proj.weight"] = self._linear_backward(block["n1"], get("attention.qkv_proj.weight"), qkv_grad)
            dx1, local["norm1.gamma"], local["norm1.beta"] = self._norm_backward(dn1, get("norm1.gamma"), block["nc1"])
            dx = self.dispatch("add", dy, dx1)
            result.update({prefix + name: value for name, value in local.items()})
        for name, ids in (("embedding.weight", tape["ids"]), ("position.weight", tape["positions"])):
            result[name] = self.dispatch("embedding_backward", w[name].shape, ids, dx)
        return result

    def manual_train_step(self, model, ids, targets, lr, phase_hook=None, *,
                          optimizer_state=None, max_grad_norm=1.0, weight_decay=0.01):
        if model.architecture not in ("byte-causal-transformer-v1", "public-content-transformer-v2"):
            raise ValueError("Manual backward supports candidate transformer only")
        weights = {name: array(p) for name, p in model.named_parameters()}
        logits, tape = self.dispatch("transformer_forward", weights, ids, getattr(model, "model_config", None))
        if phase_hook:
            phase_hook("forward")
        loss, gradient = self.dispatch("cross_entropy", logits.reshape(-1, 259), targets.reshape(-1))
        gradients = self.dispatch("transformer_backward", weights, tape, gradient.reshape(logits.shape))
        if phase_hook:
            phase_hook("backward")
        if optimizer_state is None:
            updates = {name: self.dispatch("sgd", weights[name], gradients[name], lr) for name in weights}
        else:
            updates, next_state = self.dispatch("adamw", weights, gradients, optimizer_state,
                                                lr, max_grad_norm, weight_decay)
        # Validate the entire update before committing parameters or optimizer state.
        # Only tensor storage writes occur in torch; no grad graph/AccumulateGrad.
        with torch.no_grad():
            for name, parameter in model.named_parameters():
                parameter.copy_(tensor(updates[name]))
        if optimizer_state is not None:
            optimizer_state.clear()
            optimizer_state.update(next_state)
        return float(loss), gradients

    def embedding(self, weight, ids):
        return _Embedding.apply(weight, ids, self)

    def tanh(self, x):
        return _Tanh.apply(x, self)

    def add(self, left, right):
        return _Add.apply(left, right, self)

    def cross_entropy(self, logits, targets):
        return _CrossEntropy.apply(logits, targets, self)

    def sgd_step(self, parameters, lr):
        if not 0 < lr <= 1:
            raise ValueError("SGD learning rate must be in (0,1]")
        parameters = list(parameters)
        if any(p.grad is None for p in parameters):
            raise ValueError("Missing parameter gradient")
        # Validate all updates before writing any parameter.
        updates = [self.dispatch("sgd", array(p), array(p.grad), lr) for p in parameters]
        with torch.no_grad():
            for p, update in zip(parameters, updates):
                p.copy_(tensor(update))


class _Embedding(torch.autograd.Function):
    @staticmethod
    def forward(ctx, weight, ids, backend):
        ctx.backend, ctx.shape = backend, tuple(weight.shape)
        ctx.save_for_backward(ids)
        return tensor(backend.dispatch("embedding", array(weight), array(ids)))

    @staticmethod
    def backward(ctx, grad):
        ids, = ctx.saved_tensors
        return tensor(ctx.backend.dispatch("embedding_backward", ctx.shape,
                                           array(ids), array(grad))), None, None


class _Tanh(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x, backend):
        ctx.backend = backend
        result = tensor(backend.dispatch("tanh", array(x)))
        ctx.save_for_backward(result)
        return result

    @staticmethod
    def backward(ctx, grad):
        result, = ctx.saved_tensors
        return tensor(ctx.backend.dispatch("tanh_backward", array(result), array(grad))), None


class _Add(torch.autograd.Function):
    @staticmethod
    def forward(ctx, left, right, backend):
        if left.shape != right.shape:
            raise ValueError("Candidate residual add requires equal shapes")
        ctx.backend = backend
        return tensor(backend.dispatch("add", array(left), array(right)))

    @staticmethod
    def backward(ctx, grad):
        left, right = ctx.backend.dispatch("add_backward", array(grad))
        return tensor(left), tensor(right), None


class _CrossEntropy(torch.autograd.Function):
    @staticmethod
    def forward(ctx, logits, targets, backend):
        ctx.backend = backend
        loss, ctx.gradient = backend.dispatch("cross_entropy", array(logits), array(targets))
        return tensor(loss)

    @staticmethod
    def backward(ctx, upstream):
        return tensor(ctx.backend.dispatch("cross_entropy_backward", ctx.gradient,
                                           array(upstream))), None, None
