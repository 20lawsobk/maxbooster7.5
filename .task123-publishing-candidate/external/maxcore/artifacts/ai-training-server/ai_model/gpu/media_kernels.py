"""Explicit software media kernels behind the existing DigitalGPU facade.

NumPy and compiled CPU SIMD are execution substrates here, not physical GPU
claims. This is operation dispatch, not a whole-render telemetry decorator.
Only completed kernels are counted; unsupported operations raise.
"""
from collections import Counter
from functools import partial
from threading import Lock

import numpy as np

from ai_model.maxcore.api import DigitalGPU
from ai_model.maxcore.backend.cpu_backend import DigitalGPUBackend
from ai_model.gpu.native.kernels import get_native_kernels


_NATIVE = (
    "additive_synth", "exp_decay", "freq_sweep_sin", "white_noise",
    "inplace_mul", "saw_wave", "lpf_coeffs", "hpf_coeffs", "biquad",
    "adsr", "soft_sat", "soft_limit", "compress_gain", "mix2",
)


class MediaKernelError(RuntimeError):
    """A dispatched numerical operation failed; callers must not bypass it."""


def _gradient(w, h, top, bottom):
    out = np.zeros((h, w, 3), dtype=np.uint8)
    for i, (a, b) in enumerate(zip(top, bottom)):
        out[:, :, i] = np.linspace(a, b, h, dtype=np.float32)[:, None]
    return out


def _grain(image, strength, rng=None):
    rng = rng if rng is not None else np.random
    noise = rng.randint(-strength, strength + 1, image.shape, dtype=np.int16)
    return np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def _biquad(x, b0, b1, b2, a1, a2):
    x = np.asarray(x, dtype=np.float64)
    y = np.empty_like(x)
    s1 = s2 = 0.0
    for i in range(len(x)):
        v = b0 * x[i] + s1
        s1 = b1 * x[i] - a1 * v + s2
        s2 = b2 * x[i] - a2 * v
        y[i] = v
    return y.astype(np.float32)


def _rms_compress(x, sr, threshold, ratio, attack_ms, release_ms):
    win = max(1, int(.008 * sr))
    rms = np.sqrt(np.abs(np.convolve(
        x.astype(np.float64) ** 2, np.ones(win) / win, mode="same"))).astype(np.float32)
    attack = float(np.exp(-1.0 / max(1, attack_ms * sr / 1000)))
    release = float(np.exp(-1.0 / max(1, release_ms * sr / 1000)))
    gain = np.ones(len(x), dtype=np.float32)
    g = 1.0
    for i in range(len(x)):
        r = float(rms[i])
        target = (threshold / r) * (1 - 1 / ratio) + 1 / ratio if r > threshold and r > 1e-10 else 1.
        coef = attack if target < g else release
        g = coef * g + (1 - coef) * target
        gain[i] = max(0., min(1., g))
    return x * gain


def _stereo_width(left, right, width):
    mid = (left + right) * .5
    side = (left - right) * .5 * width
    return mid + side, mid - side


def _dither(x, bit_depth):
    x = np.asarray(x, dtype=np.float32)
    lsb = 1.0 / (2 ** bit_depth)
    rng = np.random.default_rng(0xD17E4)
    a = rng.uniform(-.5 * lsb, .5 * lsb, size=x.shape).astype(np.float32)
    b = rng.uniform(-.5 * lsb, .5 * lsb, size=x.shape).astype(np.float32)
    return x + a + b


def _convolve_reverb(x, ir):
    n_fft = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(
        np.fft.rfft(x.astype(np.float64), n=n_fft) *
        np.fft.rfft(ir, n=n_fft))[:len(x)].astype(np.float32)


def _mix_buses(*buses):
    if not buses or any(bus.shape != buses[0].shape for bus in buses):
        raise ValueError("Mix buses must have the same shape")
    out = buses[0].copy()
    for bus in buses[1:]:
        out += bus
    return out


def _normalize_stereo(left, right, ceiling):
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-8)
    return ((left / peak * ceiling).astype(np.float32),
            (right / peak * ceiling).astype(np.float32))


def _pcm16(samples):
    return (np.clip(samples, -1., 1.) * 32767.).astype(np.int16)


def _scale(signal, gains):
    result = signal
    for gain in gains:
        result = result * gain
    return result


def _sidechain(bus, trigger, sr, attack_ms, release_ms, ratio, threshold):
    bus = np.asarray(bus, dtype=np.float32)
    trigger = np.asarray(trigger, dtype=np.float32)
    attack = np.float32(np.exp(-1.0 / max(1, attack_ms * sr / 1000)))
    release = np.float32(np.exp(-1.0 / max(1, release_ms * sr / 1000)))
    depth = np.float32(1.0 / ratio)
    gains = np.ones(len(bus), dtype=np.float32)
    g = np.float32(1.)
    for i in range(len(bus)):
        value = abs(float(trigger[i])) if i < len(trigger) else 0.
        target, coef = (depth, attack) if value > threshold else (np.float32(1.), release)
        g = coef * g + (np.float32(1.) - coef) * target
        gains[i] = g
    return bus * gains


def _fade_stereo(left, right, sr):
    n = len(left)
    fade_in = min(n, int(.5 * sr))
    fade_out = int(2. * sr)
    if fade_in > 0:
        ramp = np.linspace(0, 1, fade_in, dtype=np.float32)
        left[:fade_in] *= ramp
        right[:fade_in] *= ramp
    if 0 < fade_out < n:
        ramp = np.linspace(1, 0, fade_out, dtype=np.float32)
        left[-fade_out:] *= ramp
        right[-fade_out:] *= ramp
    return left, right


def _stamp_stereo(left, right, source, position, gain_left, gain_right):
    if position >= len(left) or source is None or source.size == 0:
        return
    end = min(position + len(source), len(left))
    size = end - position
    left[position:end] += source[:size] * gain_left
    right[position:end] += source[:size] * gain_right


def _unison_parameters(freq, detune_cents, count, amp):
    factors = (np.ones(1, dtype=np.float32) if count == 1 else
               (2. ** (np.linspace(-detune_cents, detune_cents, count,
                                    dtype=np.float32) / 1200.)).astype(np.float32))
    taper = np.hanning(count + 2)[1:-1].astype(np.float32) + .15
    taper /= taper.sum()
    return factors, (np.float32(freq) * factors).astype(np.float32), (taper * amp).astype(np.float32)


def _decay_envelope(n, sr, rate):
    time = np.arange(n, dtype=np.float32) / sr
    return np.exp(-time * rate).astype(np.float32)


def _piano_damp(signal, sr, gate_s, amp):
    attack = min(len(signal), max(1, int(.004 * sr)))
    signal[:attack] *= np.linspace(0, 1, attack, dtype=np.float32)
    release_at = min(len(signal), max(0, int(gate_s * sr)))
    if release_at < len(signal):
        signal[release_at:] *= _decay_envelope(len(signal) - release_at, sr, 9.)
    return signal * float(amp) * .55


def _prepare_ir(noise, envelope, pre):
    ir = noise.astype(np.float64) * envelope.astype(np.float64)
    ir[:pre] *= 0.
    peak = float(np.max(np.abs(ir)))
    return None if peak < 1e-9 else ir / peak


def _rms_envelope(signal, window):
    squared = np.convolve(signal.astype(np.float64) ** 2,
                          np.ones(window, np.float64) / window, mode="same")
    return np.sqrt(np.abs(squared)).astype(np.float32)


def _delay(x, sr, delay_ms, feedback, mix, ping_pong):
    x = np.asarray(x, dtype=np.float32)
    if not x.size:
        return x
    delay = max(1, int(delay_ms * sr / 1000.))
    stereo = x.ndim == 1 and x.size % 2 == 0
    left, right = (x[0::2].copy(), x[1::2].copy()) if stereo else (x.copy(), x.copy())
    out_l, out_r = left.copy(), right.copy()
    feedback_signal = (left + right) * .5
    for rep in range(1, 7):
        offset = delay * rep
        if offset >= len(left):
            break
        signal = feedback_signal[:len(left) - offset] * ((feedback ** rep) * mix)
        if not ping_pong or rep % 2 == 0:
            out_l[offset:] += signal
        if not ping_pong or rep % 2 == 1:
            out_r[offset:] += signal
    if not stereo:
        return (out_l + out_r) * .5
    result = np.empty(x.size, dtype=np.float32)
    result[0::2], result[1::2] = out_l, out_r
    return result


def _glitch(left, right, boundaries, bar_len):
    size = max(1, bar_len // 8)
    for pos in boundaries:
        if pos - size < 0 or pos + size * 3 >= len(left):
            continue
        sources = (left[pos-size:pos].copy(), right[pos-size:pos].copy())
        for rep in range(3):
            start = pos + rep * size
            end = start + size
            blend = float(.55 - rep * .13)
            for target, source in zip((left, right), sources):
                target[start:end] = target[start:end] * (1 - blend) + source * blend
    return left, right


def _rbj_coefficients(band, sr):
    kind = band.get("type", "peak")
    freq = max(1., min(float(band.get("freq", 1000.)), sr * .499))
    q = max(.01, float(band.get("q", 1.)))
    gain = float(band.get("gain_db", 0.))
    w = 2. * np.pi * freq / sr
    c, s = np.cos(w), np.sin(w)
    alpha, a = s / (2. * q), 10. ** (gain / 40.)
    if kind == "hp":
        values = ((1+c)/2, -(1+c), (1+c)/2, 1+alpha, -2*c, 1-alpha)
    elif kind == "lp":
        values = ((1-c)/2, 1-c, (1-c)/2, 1+alpha, -2*c, 1-alpha)
    elif kind == "peak":
        values = (1+alpha*a, -2*c, 1-alpha*a, 1+alpha/a, -2*c, 1-alpha/a)
    elif kind in ("shelf_hi", "shelf_lo"):
        root = np.sqrt(a)
        alpha2 = s/2 * np.sqrt((a+1/a)*(1/q-1)+2)
        if kind == "shelf_hi":
            values = (a*((a+1)+(a-1)*c+2*root*alpha2),
                      -2*a*((a-1)+(a+1)*c),
                      a*((a+1)+(a-1)*c-2*root*alpha2),
                      (a+1)-(a-1)*c+2*root*alpha2,
                      2*((a-1)-(a+1)*c), (a+1)-(a-1)*c-2*root*alpha2)
        else:
            values = (a*((a+1)-(a-1)*c+2*root*alpha2),
                      2*a*((a-1)-(a+1)*c),
                      a*((a+1)-(a-1)*c-2*root*alpha2),
                      (a+1)+(a-1)*c+2*root*alpha2,
                      -2*((a-1)+(a+1)*c), (a+1)+(a-1)*c-2*root*alpha2)
    else:
        raise ValueError(f"Unsupported EQ band: {kind}")
    b0, b1, b2, a0, a1, a2 = values
    inv = 1. / a0
    return b0*inv, b1*inv, b2*inv, a1*inv, a2*inv


class MediaBackend(DigitalGPUBackend):
    name = "digital_gpu_media_software"

    def __init__(self):
        super().__init__()
        native = get_native_kernels()
        self.kernels = {name: getattr(native, name) for name in _NATIVE}
        self.kernels.update({
            "gradient_rgb": _gradient, "grain_rgb": _grain,
            "biquad_df2": _biquad, "rms_compress": _rms_compress,
            "stereo_width": _stereo_width, "tpdf_dither": _dither,
            "convolve_reverb": _convolve_reverb, "mix_buses": _mix_buses,
            "normalize_stereo": _normalize_stereo, "pcm16": _pcm16,
            "sidechain": _sidechain, "fade_stereo": _fade_stereo,
            "stamp_stereo": _stamp_stereo,
            "scale": lambda x, *gains: _scale(x, gains),
            "add": np.add, "subtract": np.subtract, "multiply": np.multiply,
            "clip": np.clip,
            "linear_envelope": lambda start, stop, n: np.linspace(start, stop, n, dtype=np.float32),
            "unison_parameters": _unison_parameters, "decay_envelope": _decay_envelope,
            "piano_damp": _piano_damp, "prepare_ir": _prepare_ir,
            "rms_envelope": _rms_envelope, "delay": _delay,
            "glitch": _glitch, "rbj_coefficients": _rbj_coefficients,
        })
        self.completed = Counter()
        self._counter_lock = Lock()

    def dispatch_media(self, operation, *args, **kwargs):
        if operation not in self.kernels:
            raise NotImplementedError(f"Unsupported media kernel: {operation}")
        try:
            result = self.kernels[operation](*args, **kwargs)
        except Exception as exc:
            raise MediaKernelError(f"Media kernel {operation} failed: {exc}") from exc
        with self._counter_lock:
            self.completed[operation] += 1
        return result

    def snapshot(self):
        with self._counter_lock:
            return dict(self.completed)


class MediaDigitalGPU(DigitalGPU):
    def __init__(self):
        super().__init__(backend=MediaBackend())

    def media(self, operation, *args, **kwargs):
        return self.backend.dispatch_media(operation, *args, **kwargs)

    def __getattr__(self, name):
        # Compatibility for the existing instrument constructors, but each
        # primitive executes through the facade's explicit backend op table.
        if name in _NATIVE:
            return partial(self.media, name)
        raise AttributeError(name)


_INSTANCE = None
_LOCK = Lock()


def media_gpu():
    global _INSTANCE
    with _LOCK:
        if _INSTANCE is None:
            _INSTANCE = MediaDigitalGPU()
        return _INSTANCE