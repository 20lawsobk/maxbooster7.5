"""Strict dedicated audio entrypoint using the existing synthesis and WAV codec."""
from pathlib import Path
import wave

from ai_model.capabilities import finite_number, reject_semantic_controls
from .digital_gpu_synth import render_full_track, write_wav, _NOTE_SEMI, _genre_key


def render_audio(path, *, job_id, duration_sec=30, bpm=120, key="C minor",
                 genre="", mood="", sample_rate=44100, instrument="ensemble",
                 arrangement="structured", subject=None, reference=None, style=None):
    reject_semantic_controls(subject=subject, reference=reference, style=style)
    duration_sec = finite_number(duration_sec, "duration_sec", .05, 300)
    bpm = finite_number(bpm, "bpm", 60, 200)
    rate = finite_number(sample_rate, "sample_rate", 8000, 96000)
    if not rate.is_integer():
        raise ValueError("sample_rate must be an integer")
    sample_rate = int(rate)
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
    write_wav(path, samples, sample_rate)
    return validate_audio(path, duration_sec=duration_sec, sample_rate=sample_rate)


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
    return {"path": str(path), "frames": expected, "sample_rate": sample_rate,
            "duration": expected / sample_rate, "channels": 2,
            "renderer": "digital-gpu-parametric-synth", "trained": False}