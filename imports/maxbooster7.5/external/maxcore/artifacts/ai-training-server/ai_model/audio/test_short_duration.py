"""Short soundtrack planning regression; does not run native synthesis."""
import unittest
import numpy as np
from .digital_gpu_synth import (
    PianoVoice, SynthVoice, _drum_mix_gain, _mellow_piano_requested,
    _render_genre, _sections_for,
)


class ShortSoundtrackTest(unittest.TestCase):
    def test_short_lofi_has_chords_and_drums_not_intro_only(self):
        plan = _sections_for("lofi", 4.0, 92)
        self.assertEqual(len(plan), 1)
        self.assertIn("C", plan[0][2])
        self.assertIn("S", plan[0][2])
        self.assertLessEqual(plan[0][1] * 240 / 92, 4.0)

    def test_intent_routes_to_lofi_piano_with_quieter_drums(self):
        self.assertTrue(_mellow_piano_requested("hip-hop", "mellow piano"))
        self.assertEqual(_render_genre("hip-hop", "calm"), "lofi")
        self.assertEqual(_drum_mix_gain("hip-hop", "calm"), 0.55)
        self.assertFalse(_mellow_piano_requested("trap", "energetic"))
        self.assertEqual(_render_genre("trap", "energetic"), "trap")
        self.assertEqual(_drum_mix_gain("trap", "energetic"), 1.0)

    def test_struck_string_has_harmonics_decay_and_damped_release(self):
        class AdditiveKernel:
            calls = 0

            def additive_synth(self, freqs, amps, sample_rate, out):
                self.calls += 1
                out[:] += amps[0] * np.sin(
                    2 * np.pi * freqs[0] * np.arange(len(out)) / sample_rate)

            def saw_wave(self, freqs, amps, sample_rate, n):
                t = np.arange(n) / sample_rate
                return (np.sum(amps[:, None] *
                        (2 * ((freqs[:, None] * t) % 1) - 1), axis=0)
                        .astype(np.float32), None)

            def soft_sat(self, data, drive):
                return np.tanh(data * drive).astype(np.float32)

            def lpf_coeffs(self, *_args):
                return None

            def biquad(self, _coeffs, data, _state):
                return data

            def adsr(self, _attack, _decay, _sustain, _release, _gate, _sr, n):
                return np.ones(n, dtype=np.float32)

            def inplace_mul(self, data, envelope):
                data *= envelope

        kernel = AdditiveKernel()
        voice = PianoVoice(kernel, sample_rate=8000)
        note = voice.render_note(220, .12, 4000)
        sustained = voice.render_note(220, 1.0, 4000)
        saw = SynthVoice(kernel, sample_rate=8000).render_note(
            220, .12, 4000, n_unison=1)
        self.assertGreater(np.linalg.norm(note - saw), 1.0)
        self.assertGreaterEqual(kernel.calls, 12)  # harmonic synthesis, not saw
        self.assertEqual(note.dtype, np.float32)
        self.assertGreater(np.sqrt(np.mean(note[120:360] ** 2)), .03)
        self.assertLess(np.sqrt(np.mean(note[3200:3600] ** 2)),
                        np.sqrt(np.mean(note[120:360] ** 2)) / 10)
        self.assertGreater(np.sqrt(np.mean(sustained[3200:3600] ** 2)),
                           np.sqrt(np.mean(note[3200:3600] ** 2)) * 3)
        spectrum = np.abs(np.fft.rfft(note[100:900]))
        self.assertGreater(spectrum[22], 1.0)  # 220Hz fundamental at 10Hz/bin
        self.assertGreater(spectrum[44], .2)  # 440Hz partial


if __name__ == "__main__":
    unittest.main()