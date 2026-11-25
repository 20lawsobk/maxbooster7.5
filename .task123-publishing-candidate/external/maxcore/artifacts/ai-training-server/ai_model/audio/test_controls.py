import wave
import pytest

from .controls import render_audio, validate_audio
from .digital_gpu_synth import render_stems
from .arrangement import build_plan


def test_real_short_piano_wav_decodes(tmp_path):
    path = tmp_path / "piano.wav"
    result = render_audio(path, job_id="control-test", duration_sec=.25,
                          sample_rate=8000, instrument="piano", arrangement="loop")
    assert result["frames"] == 2000
    with wave.open(str(path)) as wav:
        assert len(wav.readframes(2000)) == 8000
    path.write_bytes(path.read_bytes()[:-20])
    with pytest.raises(ValueError, match="truncated"):
        validate_audio(path, duration_sec=.25, sample_rate=8000)


def test_instrument_isolation_and_rejection():
    stems = render_stems("isolation", 120, duration_sec=.25, sample_rate=8000,
                         instrument="piano", arrangement="loop")
    assert any(stems["pads"])
    assert not any(stems["drums"])
    assert not any(stems["bass"])
    assert not any(stems["lead"])
    with pytest.raises(ValueError, match="Unsupported instrument"):
        render_stems("unsupported", 120, instrument="violin")


def test_arrangement_stays_within_short_duration():
    plan = build_plan(.25, 120)
    assert plan
    assert plan[-1].start + plan[-1].length == .25
    assert all(section.start < .25 for section in plan)


def test_real_arrangement_control_changes_samples():
    structured = render_stems("arrangement", 120, duration_sec=.25, sample_rate=8000,
                              instrument="synth", arrangement="structured")
    loop = render_stems("arrangement", 120, duration_sec=.25, sample_rate=8000,
                        instrument="synth", arrangement="loop")
    assert (structured["pads"] != loop["pads"]).any()