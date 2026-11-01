/** Pure render contract, shared by admission and worker (including old queued jobs). */
export function audioContract(settings: Record<string, any>) {
  const format = settings.format;
  const sampleRate = settings.sampleRate ?? settings.quality?.sampleRate ?? 48000;
  const bitDepth = settings.bitDepth ?? settings.quality?.bitDepth ?? 24;
  if (![16, 24, 32].includes(bitDepth) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Invalid audio quality");
  if (settings.dither || settings.addEffectTail || settings.namingConvention === "custom" || settings.bundleAsZip === false) throw new Error("Dither, effect tails, custom naming and unbundled delivery are unsupported");
  if (format === "flac" && bitDepth === 32) throw new Error("32-bit FLAC is unsupported; select 16 or 24 bits");
  if (format === "mp3" && ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate)) throw new Error("Unsupported MP3 sample rate");
  const codecs: Record<string, string> = { wav: bitDepth === 32 ? "pcm_f32le" : `pcm_s${bitDepth}le`, flac: "flac", mp3: "libmp3lame", aac: "aac", ogg: "libvorbis", aiff: bitDepth === 32 ? "pcm_f32be" : `pcm_s${bitDepth}be` };
  if (!codecs[format]) throw new Error("Unsupported audio codec");
  return { format, sampleRate, bitDepth, codec: codecs[format] };
}

export function timelineDuration(clips: Array<{ startTime: number | null; duration: number | null }>): number {
  let end = 0;
  for (const clip of clips) {
    const start = clip.startTime ?? 0;
    const duration = clip.duration;
    if (!Number.isFinite(start) || start < 0 || !duration || !Number.isFinite(duration) || duration <= 0) throw new Error("Invalid audio clip timing");
    end = Math.max(end, start + duration);
  }
  if (!end || end > 3600) throw new Error("Export requires an audible timeline of at most one hour");
  return end;
}