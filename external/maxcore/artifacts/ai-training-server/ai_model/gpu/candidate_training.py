"""Candidate-only DigitalGPU software kernels, with explicit operation dispatch.

These are implemented host NumPy kernels, not physical GPU acceleration or
pretend calls to unavailable hardware. Torch is storage/autograd orchestration;
the numerical kernels below execute inside this backend. Existing HyperGPU GEMM,
attention and normalization remain in the existing backend.
"""
from collections import Counter
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
            "finite": lambda value: bool(np.isfinite(value).all()),
            "equal": np.array_equal,
            "greedy": self._greedy,
            "sample": self._sample,
            "rng": lambda seed: np.random.default_rng(seed),
            "token_array": lambda ids: np.asarray(ids, dtype=np.int64),
            "initialize": self._initialize,
            "transformer_forward": self._transformer_forward,
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

    def _transformer_forward(self, w, ids):
        """Explicit tape; every numerical operation lives inside this GPU kernel."""
        if ids.ndim != 2 or not 1 <= ids.shape[1] <= 128:
            raise ValueError("Manual transformer expects [batch, length<=128]")
        if np.any(ids < 0) or np.any(ids >= 259):
            raise ValueError("Invalid token ID")
        batch, length = ids.shape
        positions = np.broadcast_to(np.arange(length), ids.shape)
        x = self.dispatch("add", self.dispatch("embedding", w["embedding.weight"], ids),
                          self.dispatch("embedding", w["position.weight"], positions))
        n1, nc1 = self._norm(x, w["norm1.gamma"], w["norm1.beta"])
        qkv = self._linear(n1, w["attention.qkv_proj.weight"])
        q, k, v = [np.ascontiguousarray(part.reshape(batch, length, 4, 8)
                    .transpose(0, 2, 1, 3).reshape(batch * 4, length, 8))
                   for part in np.split(qkv, 3, axis=-1)]
        attention = self.gpu.flash_attention(q, k, v, causal=True, block_size=64)
        merged = attention.reshape(batch, 4, length, 8).transpose(0, 2, 1, 3).reshape(batch, length, 32)
        y = self.dispatch("add", x, self._linear(merged, w["attention.out_proj.weight"]))
        n2, nc2 = self._norm(y, w["norm2.gamma"], w["norm2.beta"])
        hidden = self.dispatch("tanh", self._linear(n2, w["hidden.weight"]))
        z = self.dispatch("add", y, self._linear(hidden, w["contract.weight"]))
        logits = self._linear(z, w["output.weight"])
        return logits, {"ids": ids, "positions": positions, "n1": n1, "nc1": nc1,
                        "q": q, "k": k, "v": v, "merged": merged, "n2": n2,
                        "nc2": nc2, "hidden": hidden, "z": z}

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
        """Manual reverse mode including residual gradient accumulation."""
        result = {}
        dz, result["output.weight"] = self._linear_backward(tape["z"], w["output.weight"], grad)
        dh, result["contract.weight"] = self._linear_backward(tape["hidden"], w["contract.weight"], dz)
        dh = self.dispatch("tanh_backward", tape["hidden"], dh)
        dn2, result["hidden.weight"] = self._linear_backward(tape["n2"], w["hidden.weight"], dh)
        dy2, result["norm2.gamma"], result["norm2.beta"] = self._norm_backward(
            dn2, w["norm2.gamma"], tape["nc2"])
        dy = self.dispatch("add", dz, dy2)
        merged_grad, result["attention.out_proj.weight"] = self._linear_backward(
            tape["merged"], w["attention.out_proj.weight"], dy)
        batch, length = tape["ids"].shape
        attention_grad = merged_grad.reshape(batch, length, 4, 8).transpose(
            0, 2, 1, 3).reshape(batch * 4, length, 8)
        head_grads = self._attention_backward(tape["q"], tape["k"], tape["v"], attention_grad)
        qkv_grad = np.concatenate([g.reshape(batch, 4, length, 8).transpose(
            0, 2, 1, 3).reshape(batch, length, 32) for g in head_grads], axis=-1)
        dn1, result["attention.qkv_proj.weight"] = self._linear_backward(
            tape["n1"], w["attention.qkv_proj.weight"], qkv_grad)
        dx1, result["norm1.gamma"], result["norm1.beta"] = self._norm_backward(
            dn1, w["norm1.gamma"], tape["nc1"])
        dx = self.dispatch("add", dy, dx1)
        for name, ids in (("embedding.weight", tape["ids"]), ("position.weight", tape["positions"])):
            result[name] = self.dispatch("embedding_backward", w[name].shape, ids, dx)
        return result

    def manual_train_step(self, model, ids, targets, lr, phase_hook=None):
        if model.architecture != "byte-causal-transformer-v1":
            raise ValueError("Manual backward supports candidate transformer only")
        weights = {name: array(p) for name, p in model.named_parameters()}
        logits, tape = self.dispatch("transformer_forward", weights, ids)
        if phase_hook:
            phase_hook("forward")
        loss, gradient = self.dispatch("cross_entropy", logits.reshape(-1, 259), targets.reshape(-1))
        gradients = self.dispatch("transformer_backward", weights, tape, gradient.reshape(logits.shape))
        if phase_hook:
            phase_hook("backward")
        updates = {name: self.dispatch("sgd", weights[name], gradients[name], lr) for name in weights}
        # Only tensor storage writes occur in torch; no grad graph/AccumulateGrad.
        with torch.no_grad():
            for name, parameter in model.named_parameters():
                parameter.copy_(tensor(updates[name]))
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