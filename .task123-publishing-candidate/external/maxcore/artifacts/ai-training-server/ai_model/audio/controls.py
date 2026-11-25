"""Strict dedicated audio entrypoint using the existing synthesis and WAV codec."""
from pathlib import Path
import wave
import tempfile
import os
import numpy as np

from ai_model.capabilities import finite_number, reject_semantic_controls, bounded_text, choice, capabilities, MAX_AUDIO_SAMPLE_FRAMES
from .digital_gpu_synth import render_full_track, write_wav, _NOTE_SEMI, _genre_key


def render_audio(path, *, job_id, duration_sec=30, bpm=120, key="C minor",
                 genre="", mood="", sample_rate=44100, instrument="ensemble",
                 arrangement="structured", mastering="none", subject=None, reference=None, style=None):
    reject_semantic_controls(subject=subject, reference=reference, style=style)
    bounded_text(key, "key", 32)
    bounded_text(genre, "genre", 100)
    bounded_text(mood, "mood", 200)
    supported = capabilities("audio")
    choice(instrument, "instrument", supported["instruments"])
    choice(arrangement, "arrangement", supported["arrangements"])
    choice(mastering, "mastering", ("none", "streaming"))
    duration_sec = finite_number(duration_sec, "duration_sec", .05, 300)
    if mastering == "streaming" and duration_sec < 1:
        raise ValueError("Measured mastering requires at least one second of audio")
    bpm = finite_number(bpm, "bpm", 60, 200)
    rate = finite_number(sample_rate, "sample_rate", 8000, 96000)
    if not rate.is_integer():
        raise ValueError("sample_rate must be an integer")
    sample_rate = int(rate)
    if duration_sec * sample_rate > MAX_AUDIO_SAMPLE_FRAMES:
        raise ValueError("Audio exceeds the sample-frame budget; reduce duration or sample rate")
    path = Path(path)
    if path.suffix.lower() != ".wav":
        raise ValueError("Dedicated synthesis currently exports WAV only")
    parts = key.split()
    if len(parts) != 2 or parts[0] not in _NOTE_SEMI or parts[1] not in ("minor", "major"):
        raise ValueError("key must be a supported note followed by major or minor")
    if genre and _genre_key(genre) == "default":
        raise ValueError(f"Unsupported synthesis genre: {genre}")
    samples = render_full_track(
        job_id, bpm, key, duration_sec, genre, mood, sample_rate,
        instrument=instrument, arrangement=arrangement)
    if not np.isfinite(samples).all():
        raise ValueError("Synthesizer returned non-finite audio samples")
    write_wav(path, samples, sample_rate)
    finishing = None
    if mastering == "streaming":
        from .finishing import finish_audio
        with tempfile.TemporaryDirectory(prefix="master-", dir=path.parent) as temp:
            mastered = Path(temp) / "master.wav"
            finishing = finish_audio(path, mastered, sample_rate=sample_rate, bit_depth=16)
            validate_audio(mastered, duration_sec=duration_sec, sample_rate=sample_rate)
            os.replace(mastered, path)
    result = validate_audio(path, duration_sec=duration_sec, sample_rate=sample_rate)
    if finishing is not None:
        result["audio_finishing"] = finishing
    return result


def validate_audio(path, *, duration_sec, sample_rate):
    """Read every PCM frame; a header alone is insufficient proof of an artifact."""
    with wave.open(str(path), "rb") as wav:
        expected = int(float(duration_sec) * sample_rate)
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()) != (
                2, 2, sample_rate, expected):
            raise ValueError("WAV artifact does not match requested stereo PCM duration/rate")
        data = wav.readframes(expected)
        if len(data) != expected * 4:
            raise ValueError("WAV artifact is truncated")
        samples = np.frombuffer(data, dtype="<i2").reshape(-1, 2)
        if not len(samples) or not np.any(np.ptp(samples.astype(np.int32), axis=0)):
            raise ValueError("WAV artifact contains no varying audio signal")
    return {"path": str(path), "frames": expected, "sample_rate": sample_rate,
            "duration": expected / sample_rate, "channels": 2,
            "renderer": "digital-gpu-parametric-synth", "trained": False}