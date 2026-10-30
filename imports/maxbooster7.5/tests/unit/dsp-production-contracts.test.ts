import { describe, expect, it } from 'vitest';
import {
  ALL_EFFECT_PROCESSORS, ALL_INSTRUMENT_SYNTHESIZERS,
  createBuffer, copyBuffer, mixBuffers, DelayLine, OnePoleFilter, AllPassFilter,
  BiquadFilter, ADSR, type AudioBuffer, type DSPContext,
  getEffectProcessor, getInstrumentSynthesizer,
} from '../../server/services/dsp';
import {
  SynthesizerEngine, generateFMTone, generateWavetableTone, synthesizeKick,
  formantFilter, ringModulate, type GenerationParams,
  synthesizeSynth, type SynthParams,
} from '../../shared/ml/audio/SynthesizerEngine';

const context: DSPContext = { sampleRate: 48000, tempo: 120, blockSize: 512, currentTime: 0 };
const signal = (length = 512): AudioBuffer => {
  const buffer = createBuffer(length, 2, context.sampleRate);
  for (let index = 0; index < length; index++) {
    buffer.samples[0][index] = .2 * Math.sin(index * .13) + (index === 0 ? .25 : 0);
    buffer.samples[1][index] = .15 * Math.cos(index * .07);
  }
  return buffer;
};
const energy = (samples: Float32Array) => samples.reduce((sum, sample) => sum + sample * sample, 0);
function finiteBuffer(output: AudioBuffer, length: number) {
  expect(output.sampleRate).toBe(context.sampleRate);
  expect(output.channels).toBe(2);
  expect(output.samples).toHaveLength(2);
  for (const channel of output.samples) {
    expect(channel).toHaveLength(length);
    expect(channel.every(Number.isFinite)).toBe(true);
    // Detect runaway state without imposing a limiter on deliberate EQ gains.
    expect(channel.every(sample => Math.abs(sample) < 64)).toBe(true);
  }
}

describe('registered Studio effects process actual sample blocks', () => {
  for (const [id, factory] of Object.entries(ALL_EFFECT_PROCESSORS)) {
    it(`${id} preserves timing, stereo shape, finite samples and caller-owned input`, () => {
      const input = signal();
      const before = copyBuffer(input);
      const processor = factory();
      finiteBuffer(processor.process(input, {}, context), input.samples[0].length);
      expect(input).toEqual(before);
      processor.reset();
      finiteBuffer(processor.process(createBuffer(128, 2, context.sampleRate), {}, context), 128);
    });
  }

  for (const id of ['mb-digital-delay', 'mb-plate-reverb', 'mb-chorus', 'mb-ring-mod', 'mb-vca-compressor']) {
    it(`${id} mix=0 preserves dry samples exactly`, () => {
      const input = signal();
      expect(ALL_EFFECT_PROCESSORS[id]().process(input, { mix: 0 }, context)).toEqual(input);
    });
  }

  it('digital delay time moves a real impulse and feedback creates a decaying repeat', () => {
    const input = createBuffer(2000, 2, context.sampleRate);
    input.samples[0][0] = input.samples[1][0] = 1;
    const process = (time: number, feedback = 0) => ALL_EFFECT_PROCESSORS['mb-digital-delay']().process(
      input, { timeLeft: time, timeRight: time, feedback, mix: 1, highCut: 20000 }, context);
    const short = process(10);
    const long = process(20);
    const peak = (samples: Float32Array) => samples.reduce((best, value, index) => Math.abs(value) > Math.abs(samples[best]) ? index : best, 0);
    expect(peak(long.samples[0]) - peak(short.samples[0])).toBe(480);
    const repeated = process(10, .5);
    expect(energy(repeated.samples[0].slice(800))).toBeGreaterThan(energy(short.samples[0].slice(800)));
  });
});

describe('registered Studio instrument render lifecycle', () => {
  for (const id of Object.keys(ALL_INSTRUMENT_SYNTHESIZERS)) {
    it(`${id} renders exact finite stereo frames and reset deactivates the voice`, () => {
      const synth = getInstrumentSynthesizer(id)!;
      finiteBuffer(synth.render(32, context), 32);
      synth.noteOn(220, 100, context);
      finiteBuffer(synth.render(512, context), 512);
      synth.noteOff(context);
      finiteBuffer(synth.render(128, context), 128);
      synth.reset();
      expect(synth.isActive()).toBe(false);
      const silent = synth.render(32, context);
      finiteBuffer(silent, 32);
      expect(energy(silent.samples[0]) + energy(silent.samples[1])).toBe(0);
    });
  }
});

describe('DSP primitive signal contracts', () => {
  it('unsupported and inherited plugin names do not invoke object prototype members', () => {
    for (const id of ['missing-plugin', '__proto__', 'constructor', 'toString']) {
      expect(getEffectProcessor(id)).toBeNull();
      expect(getInstrumentSynthesizer(id)).toBeNull();
    }
  });
  it('copy and dry/wet mixing do not alias the input and preserve unity endpoints', () => {
    const dry = signal(32), wet = createBuffer(32, 2, context.sampleRate);
    const copy = copyBuffer(dry);
    copy.samples[0][0] = 50;
    expect(dry.samples[0][0]).toBe(.25);
    expect(mixBuffers(dry, wet, 0)).toEqual(dry);
    expect(mixBuffers(dry, wet, 1)).toEqual(wet);
    expect(mixBuffers(dry, wet, .5).samples[0][0]).toBe(.125);
  });

  it('high-pass rejects DC while low-pass retains DC after settling', () => {
    const high = new OnePoleFilter(), low = new OnePoleFilter();
    high.setHighpass(1000, context.sampleRate);
    low.setLowpass(1000, context.sampleRate);
    let hi = 0, lo = 0;
    for (let index = 0; index < 2000; index++) { hi = high.process(1); lo = low.process(1); }
    expect(Math.abs(hi)).toBeLessThan(1e-6);
    expect(lo).toBeCloseTo(1, 6);
    high.clear();
    expect(high.process(0)).toBe(0);
  });

  it('all-pass changes phase while preserving impulse energy', () => {
    const allPass = new AllPassFilter(13, .5);
    const output = Float32Array.from({ length: 512 }, (_, index) => allPass.process(index === 0 ? 1 : 0));
    expect(energy(output)).toBeCloseTo(1, 6);
    expect(output[0]).toBeCloseTo(-.5);
    allPass.clear();
    expect(allPass.process(0)).toBe(0);
  });

  it('lowpass attenuates alternating Nyquist input and reset clears filter history', () => {
    const filter = new BiquadFilter();
    filter.setLowpass(1000, .707, context.sampleRate);
    let output = 0;
    for (let index = 0; index < 2000; index++) output = filter.process(index % 2 ? -1 : 1);
    expect(Math.abs(output)).toBeLessThan(.001);
    filter.clear();
    expect(filter.process(0)).toBe(0);
  });

  it('delay interpolation preserves a fractional impulse and clear removes history', () => {
    const delay = new DelayLine(16);
    delay.write(1);
    expect(delay.read(1)).toBe(1);
    expect(delay.readInterpolated(1.5)).toBe(.5);
    delay.clear();
    expect(delay.read(1)).toBe(0);
  });

  it('ADSR attack reaches sustain and release reaches zero without nonfinite samples', () => {
    const env = new ADSR(.001, .001, .4, .001, context.sampleRate);
    env.trigger();
    const values = Array.from({ length: 150 }, () => env.process());
    expect(values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(values.at(-1)).toBeCloseTo(.4);
    env.release();
    for (let index = 0; index < 100; index++) env.process();
    expect(env.isActive()).toBe(false);
    expect(env.process()).toBe(0);
  });
});

describe('shared offline synthesizer actual waveform generation', () => {
  const singleOscillator = (): SynthParams => ({
    type: 'lead', oscillators: [{ type: 'sine', frequency: 1, detune: 0 }],
    filter: { type: 'lowpass', cutoff: 18000, resonance: .707, envAmount: 0,
      envelope: { attack: 0, decay: 0, sustain: 1, release: .005 } },
    ampEnvelope: { attack: 0, decay: 0, sustain: .5, release: .005 },
  });

  it('oscillator frequency ratios change the actual played fundamental', () => {
    const params = singleOscillator();
    const render = () => synthesizeSynth(params, 'A', 3, { sampleRate: 48000, duration: .05, tempo: 120 });
    const root = render();
    params.oscillators[0].frequency = 2;
    const octave = render();
    const magnitude = (samples: Float32Array, frequency: number) => {
      let real = 0, imaginary = 0;
      samples.forEach((sample, index) => {
        const phase = 2 * Math.PI * frequency * index / 48000;
        real += sample * Math.cos(phase); imaginary += sample * Math.sin(phase);
      });
      return Math.hypot(real, imaginary);
    };
    expect(magnitude(root, 220)).toBeGreaterThan(5 * magnitude(root, 440));
    expect(magnitude(octave, 440)).toBeGreaterThan(5 * magnitude(octave, 220));
  });

  it('rejects nonfinite envelopes and excessive oscillator counts before allocating render work', () => {
    const params = singleOscillator();
    const render = () => synthesizeSynth(params, 'A', 3, { sampleRate: 48000, duration: .05, tempo: 120 });
    params.ampEnvelope.attack = NaN;
    expect(render).toThrow(/attack/);
    params.ampEnvelope.attack = 0;
    params.unison = { voices: 1000, detune: 0, spread: 0 };
    expect(render).toThrow(/voices/);
    params.unison = undefined;
    params.oscillators = [];
    expect(render).toThrow(/oscillators/);
  });

  for (const drum of ['kick', 'snare', 'hihat', 'clap'] as const) {
    it(`${drum} generates nonempty bounded audio for the requested duration`, () => {
      const output = new SynthesizerEngine(context.sampleRate).generateDrum(drum, undefined, .05);
      expect(output).toHaveLength(2400);
      expect(output.every(Number.isFinite)).toBe(true);
      expect(energy(output)).toBeGreaterThan(.01);
      expect(output.every(sample => Math.abs(sample) <= 2)).toBe(true);
    });
  }

  it('kick zero distortion and tone are genuine controls rather than replaced defaults', () => {
    const params: GenerationParams = { sampleRate: 48000, duration: .05, tempo: 120 };
    const plain = synthesizeKick({ type: 'kick', distortion: 0, tone: 0, snap: 0 }, params);
    const colored = synthesizeKick({ type: 'kick', distortion: .3, tone: .5, snap: .5 }, params);
    expect(plain).not.toEqual(colored);
  });

  it('FM and wavetable preserve exact requested samples, are bounded and respect voice choice', () => {
    const fm = generateFMTone(220, .05, 48000, 'electric_piano', .8);
    const wave = generateWavetableTone(220, .05, 48000, 'sine', 'sine');
    expect(fm).toHaveLength(2400);
    expect(wave).toHaveLength(2400);
    expect(fm.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
    expect(wave.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
    expect(energy(fm)).toBeGreaterThan(.01);
    expect(wave).not.toEqual(generateWavetableTone(220, .05, 48000, 'square', 'square'));
    expect(generateFMTone(220, .05, 48000, 'electric_piano', 0).every(sample => sample === 0)).toBe(true);
  });

  it('formant and ring controls preserve dry mix exactly, do not mutate input and affect wet audio', () => {
    const input = signal(2048).samples[0], before = new Float32Array(input);
    expect(formantFilter(input, 48000, 'a', 0)).toEqual(input);
    expect(ringModulate(input, 48000, 440, 0)).toEqual(input);
    expect(formantFilter(input, 48000, 'a', 1)).not.toEqual(formantFilter(input, 48000, 'u', 1));
    expect(ringModulate(input, 48000, 440, 1)).not.toEqual(ringModulate(input, 48000, 880, 1));
    expect(input).toEqual(before);
  });

  it('rejects unsupported instruments, invalid notes and nonfinite/resource-exhausting render controls', () => {
    expect(() => new SynthesizerEngine(NaN)).toThrow();
    const engine = new SynthesizerEngine(48000);
    expect(() => engine.generateDrum('tom')).toThrow(/unsupported/i);
    expect(() => engine.generateBass('not-a-note', 2)).toThrow(/note/i);
    expect(() => engine.generateDrum('kick', undefined, Infinity)).toThrow();
    expect(() => generateFMTone(220, -1, 48000)).toThrow();
    expect(() => generateWavetableTone(NaN, 1, 48000)).toThrow();
  });
});
