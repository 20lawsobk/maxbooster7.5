"""Real backend execution and decodes, not facade-call mocks."""
import wave

import numpy as np
import pytest

from ai_model.maxcore.api import DigitalGPU
from ai_model.gpu.media_kernels import MediaKernelError, media_gpu
from ai_model.image import image_engine
from ai_model.video.scenes import _np_gradient
from .controls import render_audio
from .digital_gpu_synth import apply_delay, apply_glitch_transition, _rbj_biquad_coeffs


def test_media_facade_is_real_dispatch_and_unknown_ops_fail():
    gpu = media_gpu()
    assert isinstance(gpu, DigitalGPU)
    before = gpu.backend.snapshot()
    with pytest.raises(NotImplementedError):
        gpu.media("unimplemented")
    assert gpu.backend.snapshot() == before
    x = np.array([.1, -.2, .3], dtype=np.float32)
    assert np.array_equal(gpu.media("biquad_df2", x, 1., 0., 0., 0., 0.), x)
    assert gpu.backend.snapshot()["biquad_df2"] > before.get("biquad_df2", 0)


def test_dither_and_pcm_are_lossless_against_original_arithmetic():
    x = np.linspace(-1, 1, 200, dtype=np.float32)
    rng = np.random.default_rng(0xD17E4)
    lsb = 1 / 65536
    expected = (x + rng.uniform(-.5 * lsb, .5 * lsb, x.shape).astype(np.float32)
                + rng.uniform(-.5 * lsb, .5 * lsb, x.shape).astype(np.float32))
    actual = media_gpu().media("tpdf_dither", x, 16)
    assert np.array_equal(actual, expected)
    assert np.array_equal(media_gpu().media("pcm16", actual),
                          (np.clip(expected, -1, 1) * 32767).astype(np.int16))


def test_image_video_backgrounds_use_same_real_gradient_kernel():
    top, bottom = (10, 20, 30), (60, 80, 100)
    expected = np.zeros((48, 64, 3), dtype=np.uint8)
    for i, (a, b) in enumerate(zip(top, bottom)):
        expected[:, :, i] = np.linspace(a, b, 48, dtype=np.float32)[:, None]
    before = media_gpu().backend.snapshot().get("gradient_rgb", 0)
    assert np.array_equal(image_engine._gradient_array(64, 48, top, bottom), expected)
    assert np.array_equal(_np_gradient(top, bottom, 64, 48), expected)
    assert media_gpu().backend.snapshot()["gradient_rgb"] == before + 2


def test_actual_audio_artifact_depends_on_executed_kernel(tmp_path, monkeypatch):
    gpu = media_gpu()
    before = gpu.backend.snapshot()
    first = tmp_path / "real.wav"
    render_audio(first, job_id="facade-test", duration_sec=.25, sample_rate=8000,
                 instrument="piano", arrangement="loop")
    with wave.open(str(first)) as wav:
        real_pcm = wav.readframes(wav.getnframes())
    assert any(real_pcm)
    after = gpu.backend.snapshot()
    for operation in ("additive_synth", "biquad_df2", "rms_compress",
                      "convolve_reverb", "normalize_stereo", "pcm16",
                      "stamp_stereo", "sidechain"):
        assert after.get(operation, 0) > before.get(operation, 0), operation
    # Changing a backend kernel's actual result changes the decoded file.
    # A telemetry-only wrapper could not pass this test.
    monkeypatch.setitem(gpu.backend.kernels, "pcm16",
                        lambda x: np.zeros(len(x), dtype=np.int16))
    muted = tmp_path / "muted.wav"
    render_audio(muted, job_id="facade-test", duration_sec=.25, sample_rate=8000,
                 instrument="piano", arrangement="loop")
    with wave.open(str(muted)) as wav:
        assert not any(wav.readframes(wav.getnframes()))


@pytest.mark.parametrize("instrument,operation", [
    ("piano", "piano_damp"), ("synth", "unison_parameters"),
    ("bass", "scale"), ("drums", "add"), ("ensemble", "linear_envelope"),
])
def test_all_supported_instruments_real_pcm_and_signal_dispatch(tmp_path, instrument, operation):
    before = media_gpu().backend.snapshot()
    path = tmp_path / f"{instrument}.wav"
    render_audio(path, job_id="all-signal", duration_sec=.25, sample_rate=8000,
                 instrument=instrument, arrangement="loop")
    with wave.open(str(path)) as wav:
        assert (wav.getnframes(), wav.getframerate(), wav.getnchannels()) == (2000, 8000, 2)
        pcm = np.frombuffer(wav.readframes(2000), dtype="<i2")
        assert len(pcm) == 4000
        assert np.max(np.abs(pcm)) > 100
    after = media_gpu().backend.snapshot()
    for name in (operation, "rbj_coefficients", "subtract", "mix_buses",
                 "prepare_ir", "clip"):
        assert after.get(name, 0) > before.get(name, 0), name


def test_delay_and_glitch_signal_kernels_have_actual_effect():
    impulse = np.zeros(32, dtype=np.float32)
    impulse[0] = impulse[1] = 1.
    delayed = apply_delay(impulse, 8000, .5, feedback=.5, mix=.5)
    # Four-frame delay, first echo to right, next echo to left.
    assert delayed[9] == .25
    assert delayed[16] == .125
    assert delayed[8] == 0
    left = np.linspace(-1, 1, 100, dtype=np.float32)
    right = left[::-1].copy()
    expected_l, expected_r = left.copy(), right.copy()
    for rep in range(3):
        blend = .55 - rep * .13
        start = 30 + rep * 2
        expected_l[start:start+2] = expected_l[start:start+2] * (1-blend) + left[28:30] * blend
        expected_r[start:start+2] = expected_r[start:start+2] * (1-blend) + right[28:30] * blend
    actual_l, actual_r = apply_glitch_transition(left.copy(), right.copy(), [30], 16)
    assert np.array_equal(actual_l, expected_l)
    assert np.array_equal(actual_r, expected_r)


def test_rbj_coefficients_and_envelopes_match_reference():
    sr, freq, q = 8000, 600., .707
    w = 2 * np.pi * freq / sr
    c, alpha = np.cos(w), np.sin(w) / (2*q)
    inv = 1 / (1+alpha)
    expected = ((1-c)/2*inv, (1-c)*inv, (1-c)/2*inv, -2*c*inv, (1-alpha)*inv)
    assert np.array_equal(_rbj_biquad_coeffs({"type": "lp", "freq": freq, "q": q}, sr), expected)
    envelope = media_gpu().media("decay_envelope", 2000, sr, 2.1)
    reference = np.exp(-(np.arange(2000, dtype=np.float32) / sr) * 2.1).astype(np.float32)
    assert np.array_equal(envelope, reference)


def test_failed_signal_kernel_is_not_silently_bypassed(tmp_path, monkeypatch):
    def fail(*_args):
        raise RuntimeError("deliberate filter failure")
    monkeypatch.setitem(media_gpu().backend.kernels, "rbj_coefficients", fail)
    path = tmp_path / "failed.wav"
    with pytest.raises(MediaKernelError, match="rbj_coefficients"):
        render_audio(path, job_id="fail-test", duration_sec=.25,
                     sample_rate=8000, instrument="piano", arrangement="loop")
    assert not path.exists()