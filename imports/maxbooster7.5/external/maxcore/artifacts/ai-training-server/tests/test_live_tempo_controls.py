from unittest.mock import Mock, patch
import pytest
from ai_model.generation.dedicated import conditioned_controls


def measured(bpm=117, previews=3):
    return Mock(to_dict=lambda: {"secondary": {"music_features": {
        "global": {"bpm_median": bpm, "measured_previews": previews}
    }}})


def test_explicit_live_tempo_uses_measurement_not_renderer_default():
    with patch("ai_model.generation.awareness.sampling_snapshot", return_value=measured()):
        controls = conditioned_controls("audio", {"use_awareness_tempo": True})
    assert controls == {"bpm": 117}


@pytest.mark.parametrize("snapshot", [None, measured(previews=0), measured(bpm=999)])
def test_missing_or_invalid_measurements_fail_explicitly(snapshot):
    with patch("ai_model.generation.awareness.sampling_snapshot", return_value=snapshot):
        with pytest.raises(ValueError, match="Measured live tempo unavailable"):
            conditioned_controls("audio", {"use_awareness_tempo": True})


def test_explicit_bpm_is_preserved_and_conflicts_are_rejected():
    with patch("ai_model.generation.awareness.sampling_snapshot", return_value=measured()):
        assert conditioned_controls("audio", {"bpm": 90}) == {"bpm": 90}
        with pytest.raises(ValueError):
            conditioned_controls("audio", {"bpm": 90, "use_awareness_tempo": True})
        with pytest.raises(ValueError):
            conditioned_controls("image", {"use_awareness_tempo": True})
        with pytest.raises(ValueError):
            conditioned_controls("audio", {"use_awareness_tempo": "true"})
