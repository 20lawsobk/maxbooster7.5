import wave
import numpy as np
import pytest
from ai_model.audio.finishing import finish_audio, verify_finished_audio
from ai_model.audio.voiceover import mix_voiceover_over_music

RATE = 44100


def write(path, samples):
    with wave.open(str(path), "wb") as output:
        output.setparams((samples.shape[1] if samples.ndim == 2 else 1, 2, RATE, len(samples), "NONE", "not compressed"))
        output.writeframes((samples * 32767).astype("<i2").tobytes())


def test_real_ducking_follows_speech_and_recovers_between_phrases(tmp_path):
    t = np.arange(RATE * 5) / RATE
    music = .25 * np.stack([np.sin(2 * np.pi * 1200 * t), np.sin(2 * np.pi * 1600 * t)], axis=1)
    voice = .5 * np.sin(2 * np.pi * 440 * t) * ((t >= 1) & (t < 2))
    bed, speech, output = (tmp_path / name for name in ("music.wav", "speech.wav", "mix.wav"))
    write(bed, music)
    write(speech, voice)
    assert mix_voiceover_over_music(str(speech), str(bed), str(output), 5)
    with wave.open(str(output)) as stream:
        assert stream.getnframes() == RATE * 5
        assert stream.getnchannels() == 2
        stereo = np.frombuffer(stream.readframes(RATE * 5), dtype="<i2").reshape(-1, 2) / 32768
        assert np.max(np.abs(stereo[:, 0] - stereo[:, 1])) > .001
        samples = stereo.mean(axis=1)
    def music_amplitude(start):
        a, b = round(start * RATE), round((start + .4) * RATE)
        # Isolate the known bed frequency; speech is independently at 440 Hz.
        return abs(2 * np.mean(samples[a:b] * np.exp(-2j * np.pi * 1200 * t[a:b])))
    before, during, recovered = map(music_amplitude, [.2, 1.4, 4.0])
    assert during < before * .5
    assert recovered > before * .9


def test_two_pass_master_is_measured_and_preserves_source_and_duration(tmp_path):
    source, finished = tmp_path / "quiet.wav", tmp_path / "master.wav"
    t = np.arange(RATE * 5) / RATE
    write(source, .03 * np.sin(2 * np.pi * 440 * t))
    original = source.read_bytes()
    receipt = finish_audio(source, finished)
    assert receipt["verified"]
    assert abs(receipt["integrated_lufs"] + 16) <= 1
    assert receipt["true_peak_dbtp"] <= -1
    assert source.read_bytes() == original
    assert verify_finished_audio(finished) == receipt
    with wave.open(str(finished)) as stream:
        assert stream.getnframes() == RATE * 5
        assert stream.getnchannels() == 2


def test_silence_cannot_receive_a_finishing_certificate(tmp_path):
    source, finished = tmp_path / "silent.wav", tmp_path / "master.wav"
    write(source, np.zeros(RATE * 5))
    with pytest.raises(ValueError, match="not measurable"):
        finish_audio(source, finished)
    assert not finished.exists()


def test_standalone_synthesis_preserves_requested_pcm_contract_when_mastered(tmp_path):
    from ai_model.audio.controls import render_audio
    output = tmp_path / "standalone.wav"
    result = render_audio(output, job_id="mastering-test", duration_sec=3, sample_rate=8000,
                          instrument="piano", arrangement="loop", mastering="streaming")
    assert result["audio_finishing"]["verified"]
    assert result["frames"] == 24000
    with wave.open(str(output)) as stream:
        assert (stream.getframerate(), stream.getsampwidth(), stream.getnchannels()) == (8000, 2, 2)
