export * from './core';

import { DSPProcessor } from './core';

import { REVERB_PROCESSORS } from './reverbEngines';
import { DELAY_PROCESSORS } from './delayEngines';
import { COMPRESSOR_PROCESSORS } from './compressorEngines';
import { EQ_PROCESSORS } from './eqEngines';
import { DISTORTION_PROCESSORS } from './distortionEngines';
import { MODULATION_PROCESSORS } from './modulationEngines';
import { DYNAMICS_PROCESSORS } from './dynamicsEngines';
import { VOCAL_PROCESSORS } from './vocalEngines';
import { MICROPHONE_PROCESSORS } from './microphoneEngines';

import { PIANO_SYNTHESIZERS } from './instruments/pianoEngines';
import { STRINGS_SYNTHESIZERS } from './instruments/stringsEngines';
import { DRUMS_SYNTHESIZERS } from './instruments/drumsEngines';
import { BASS_SYNTHESIZERS } from './instruments/bassEngines';
import { PADS_SYNTHESIZERS } from './instruments/padsEngines';
import { ANALOG_SYNTH_SYNTHESIZERS } from './instruments/analogSynthEngines';
import { FM_SYNTH_SYNTHESIZERS } from './instruments/fmSynthEngines';
import { WAVETABLE_SYNTH_SYNTHESIZERS } from './instruments/wavetableSynthEngines';
import { SAMPLER_SYNTHESIZERS } from './instruments/samplerEngines';

export const ALL_EFFECT_PROCESSORS: Record<string, () => DSPProcessor> = {
  ...REVERB_PROCESSORS,
  ...DELAY_PROCESSORS,
  ...COMPRESSOR_PROCESSORS,
  ...EQ_PROCESSORS,
  ...DISTORTION_PROCESSORS,
  ...MODULATION_PROCESSORS,
  ...DYNAMICS_PROCESSORS,
  ...VOCAL_PROCESSORS,
  ...MICROPHONE_PROCESSORS,
};

export interface SynthesizerEngine {
  noteOn(frequency: number, velocity: number, context: { sampleRate: number; tempo: number }): void;
  noteOff(context: { sampleRate: number }): void;
  render(numSamples: number, context: { sampleRate: number; tempo: number }): { samples: Float32Array[]; sampleRate: number; channels: number };
  isActive(): boolean;
  reset(): void;
}

export const ALL_INSTRUMENT_SYNTHESIZERS: Record<string, new () => SynthesizerEngine> = {
  ...PIANO_SYNTHESIZERS,
  ...STRINGS_SYNTHESIZERS,
  ...DRUMS_SYNTHESIZERS,
  ...BASS_SYNTHESIZERS,
  ...PADS_SYNTHESIZERS,
  ...ANALOG_SYNTH_SYNTHESIZERS,
  ...FM_SYNTH_SYNTHESIZERS,
  ...WAVETABLE_SYNTH_SYNTHESIZERS,
  ...SAMPLER_SYNTHESIZERS,
};

export function getEffectProcessor(pluginId: string): DSPProcessor | null {
  const factory = ALL_EFFECT_PROCESSORS[pluginId];
  return factory ? factory() : null;
}

export function getInstrumentSynthesizer(pluginId: string): SynthesizerEngine | null {
  const SynthClass = ALL_INSTRUMENT_SYNTHESIZERS[pluginId];
  return SynthClass ? new SynthClass() : null;
}

export function listAvailableEffects(): string[] {
  return Object.keys(ALL_EFFECT_PROCESSORS);
}

export function listAvailableInstruments(): string[] {
  return Object.keys(ALL_INSTRUMENT_SYNTHESIZERS);
}

export function getProcessorInfo() {
  return {
    effects: {
      reverb: Object.keys(REVERB_PROCESSORS),
      delay: Object.keys(DELAY_PROCESSORS),
      compressor: Object.keys(COMPRESSOR_PROCESSORS),
      eq: Object.keys(EQ_PROCESSORS),
      distortion: Object.keys(DISTORTION_PROCESSORS),
      modulation: Object.keys(MODULATION_PROCESSORS),
      dynamics: Object.keys(DYNAMICS_PROCESSORS),
      vocal: Object.keys(VOCAL_PROCESSORS),
      microphone: Object.keys(MICROPHONE_PROCESSORS),
      total: Object.keys(ALL_EFFECT_PROCESSORS).length,
    },
    instruments: {
      piano: Object.keys(PIANO_SYNTHESIZERS),
      strings: Object.keys(STRINGS_SYNTHESIZERS),
      drums: Object.keys(DRUMS_SYNTHESIZERS),
      bass: Object.keys(BASS_SYNTHESIZERS),
      pads: Object.keys(PADS_SYNTHESIZERS),
      analogSynth: Object.keys(ANALOG_SYNTH_SYNTHESIZERS),
      fmSynth: Object.keys(FM_SYNTH_SYNTHESIZERS),
      wavetableSynth: Object.keys(WAVETABLE_SYNTH_SYNTHESIZERS),
      sampler: Object.keys(SAMPLER_SYNTHESIZERS),
      total: Object.keys(ALL_INSTRUMENT_SYNTHESIZERS).length,
    },
    grandTotal: Object.keys(ALL_EFFECT_PROCESSORS).length + Object.keys(ALL_INSTRUMENT_SYNTHESIZERS).length,
  };
}

export {
  REVERB_PROCESSORS,
  DELAY_PROCESSORS,
  COMPRESSOR_PROCESSORS,
  EQ_PROCESSORS,
  DISTORTION_PROCESSORS,
  MODULATION_PROCESSORS,
  DYNAMICS_PROCESSORS,
  VOCAL_PROCESSORS,
  MICROPHONE_PROCESSORS,
  PIANO_SYNTHESIZERS,
  STRINGS_SYNTHESIZERS,
  DRUMS_SYNTHESIZERS,
  BASS_SYNTHESIZERS,
  PADS_SYNTHESIZERS,
  ANALOG_SYNTH_SYNTHESIZERS,
  FM_SYNTH_SYNTHESIZERS,
  WAVETABLE_SYNTH_SYNTHESIZERS,
  SAMPLER_SYNTHESIZERS,
};
