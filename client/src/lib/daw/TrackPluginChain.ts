import { PluginHost } from '../audio/PluginHost';
import type { BasePlugin } from '../../../../built-in plugins dsp/BasePlugin';
import { EQPlugin } from '../../../../built-in plugins dsp/EQPlugin';

export const BROWSER_EFFECT_TYPES = ['eq', 'compressor', 'reverb', 'delay', 'distortion', 'chorus', 'flanger', 'phaser'] as const;
export interface TrackInsert {
  id: string; type?: string; pluginId?: string; pluginSlug?: string; name: string;
  bypass?: boolean; bypassed?: boolean; expanded?: boolean;
  parameters: Record<string, unknown>;
}
export const supportsBrowserEffect = (type: string) => BROWSER_EFFECT_TYPES.includes(type as typeof BROWSER_EFFECT_TYPES[number]);
export function trackInsertType(insert: Pick<TrackInsert, 'type' | 'pluginSlug' | 'pluginId' | 'name'>): string {
  if (insert.type && supportsBrowserEffect(insert.type)) return insert.type;
  const slug = insert.pluginSlug || insert.pluginId || insert.name;
  const prefixes: Record<string, string> = { eq: 'eq', comp: 'compressor', compressor: 'compressor',
    reverb: 'reverb', delay: 'delay', dist: 'distortion', distortion: 'distortion',
    chorus: 'chorus', flanger: 'flanger', phaser: 'phaser' };
  const prefix = /^mb-([a-z]+)(?:-|$)/.exec(slug)?.[1];
  return prefix ? prefixes[prefix] || insert.type || '' : insert.type || '';
}

/** One processor per instance, in saved order, ahead of the track fader. */
export class TrackPluginChain {
  readonly input: GainNode;
  private host: PluginHost;
  private processors = new Map<string, { type: string; plugin: BasePlugin; signature: string }>();
  private order: string | null = null;
  constructor(context: AudioContext, private destination: AudioNode) {
    this.host = new PluginHost(context);
    this.input = context.createGain(); this.input.connect(destination);
  }
  sync(inserts: TrackInsert[]): string[] {
    if (inserts.length > 32) throw new Error('A track supports at most 32 browser inserts');
    const unavailable: string[] = []; const active: string[] = [];
    const retained = new Set<string>();
    for (const insert of inserts) {
      const type = trackInsertType(insert);
      if (!supportsBrowserEffect(type)) { unavailable.push(insert.id); continue; }
      if (retained.has(insert.id)) throw new Error('Duplicate plugin instance');
      retained.add(insert.id);
      // Remove bypassed inserts from the graph too. A stereo processor left
      // inline can change mono channel mixing even with its wet gain at zero.
      if (!(insert.bypassed ?? insert.bypass ?? false)) active.push(insert.id);
      let current = this.processors.get(insert.id);
      if (current && current.type !== type) { current.plugin.destroy(); this.processors.delete(insert.id); current = undefined; }
      if (!current) {
        const plugin = this.host.createPlugin(type);
        if (!plugin) { unavailable.push(insert.id); continue; }
        current = { type, plugin, signature: '' }; this.processors.set(insert.id, current);
        this.order = null;
      }
      const signature = JSON.stringify([insert.parameters, insert.bypassed ?? insert.bypass ?? false]);
      if (signature !== current.signature) {
        const p = Object.fromEntries(Object.entries(insert.parameters).filter(([, value]) => typeof value !== 'number' || Number.isFinite(value)));
        // Rack controls use milliseconds/percent; processor APIs use seconds/0–1.
        if (typeof p.mix === 'number') p.mix /= 100;
        if (type === 'compressor') for (const key of ['attack', 'release']) if (typeof p[key] === 'number') p[key] /= 1000;
        if (type === 'delay') {
          if (typeof p.time === 'number') { p.delayTimeL = p.time / 1000; p.delayTimeR = p.time / 1000; }
          if (typeof p.feedback === 'number') p.feedback /= 100;
        }
        if (type === 'reverb') {
          if (typeof p.size === 'number') p.roomSize = p.size / 100;
          if (typeof p.damping === 'number') p.damping /= 100;
          if (typeof p.preDelay === 'number') p.preDelay /= 1000;
          if (typeof p.decay === 'number') p.decay /= 10;
        }
        if (type === 'distortion') for (const key of ['drive', 'tone']) if (typeof p[key] === 'number') p[key] /= 100;
        if (['chorus', 'flanger', 'phaser'].includes(type)) {
          if (typeof p.depth === 'number') p.depth = p.depth / 100 * (type === 'chorus' ? 0.01 : type === 'flanger' ? 0.005 : 1);
          if (typeof p.feedback === 'number') p.feedback /= 100;
        }
        if (type === 'eq' && current.plugin instanceof EQPlugin) {
          const eq = current.plugin;
          eq.setBand(1, Number(p.lowFreq ?? 80), Number(p.low ?? p.lowGain ?? 0), Number(p.lowQ ?? 0.7));
          eq.setBand(3, Number(p.midFreq ?? 1000), Number(p.mid ?? p.midGain ?? 0), Number(p.midQ ?? 1));
          eq.setBand(5, Number(p.highFreq ?? 8000), Number(p.high ?? p.highGain ?? 0), Number(p.highQ ?? 0.7));
        }
        current.plugin.setParameters(p);
        current.plugin.setBypass(insert.bypassed ?? insert.bypass ?? false);
        current.signature = signature;
      }
    }
    for (const [id, value] of this.processors) if (!retained.has(id)) { value.plugin.destroy(); this.processors.delete(id); this.order = null; }
    const order = active.join('|');
    if (this.order !== order) {
      this.input.disconnect();
      for (const value of this.processors.values()) value.plugin.disconnect();
      let previous: AudioNode = this.input;
      for (const id of active) {
        const value = this.processors.get(id); if (!value) continue;
        previous.connect(value.plugin.getInput()); previous = value.plugin.getOutput();
      }
      previous.connect(this.destination); this.order = order;
    }
    return unavailable;
  }
  destroy() { this.input.disconnect(); for (const value of this.processors.values()) value.plugin.destroy(); this.processors.clear(); this.host.destroy(); }
}
