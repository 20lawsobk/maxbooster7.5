import { logger } from "../logger?.js";
import { musicIndustryContextFilter } from "./musicIndustryContextFilter?.js";

export interface MelodyPattern {
  notes: number[];
  durations: number[];
  velocities: number[];
  octave: number;
}

export interface DrumPattern {
  kick: number[];
  snare: number[];
  hihat: number[];
  clap: number[];
  percussion: number[];
  steps: number;
}

export interface ChordProgression {
  chords: string[];
  durations: number[];
  voicings: number[][];
}

export interface GenerationParams {
  instrument: string;
  genre: string;
  style: string;
  key: string;
  scale: string;
  tempo: number;
  bars: number;
  complexity: number;
  swing: number;
  humanize: number;
}

const _NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  whole_tone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  augmented: [0, 3, 4, 7, 8, 11],
  hungarian_minor: [0, 2, 3, 6, 7, 8, 11],
  japanese: [0, 1, 5, 7, 8],
  arabic: [0, 1, 4, 5, 7, 8, 11],
  persian: [0, 1, 4, 5, 6, 8, 11],
  indian: [0, 1, 4, 5, 7, 8, 10],
  flamenco: [0, 1, 4, 5, 7, 8, 10],
  gypsy: [0, 2, 3, 6, 7, 8, 10],
};

const _INSTRUMENTS = {
  melodic: [
    "piano",
    "synth_lead",
    "synth_pad",
    "synth_pluck",
    "synth_brass",
    "electric_piano",
    "organ",
    "harpsichord",
    "celesta",
    "vibraphone",
    "marimba",
    "xylophone",
    "bells",
    "kalimba",
    "music_box",
    "guitar_acoustic",
    "guitar_electric",
    "guitar_nylon",
    "guitar_jazz",
    "bass_acoustic",
    "bass_electric",
    "bass_synth",
    "bass_808",
    "bass_sub",
    "strings_violin",
    "strings_viola",
    "strings_cello",
    "strings_ensemble",
    "brass_trumpet",
    "brass_trombone",
    "brass_french_horn",
    "brass_tuba",
    "woodwind_flute",
    "woodwind_clarinet",
    "woodwind_oboe",
    "woodwind_saxophone",
    "vocal_lead",
    "vocal_harmony",
    "vocal_choir",
    "vocal_whisper",
    "ethnic_sitar",
    "ethnic_koto",
    "ethnic_erhu",
    "ethnic_oud",
    "ethnic_pan_flute",
    "ethnic_didgeridoo",
    "ethnic_balalaika",
  ],
  drums: [
    "acoustic_kit",
    "electronic_kit",
    "808_kit",
    "909_kit",
    "trap_kit",
    "jazz_kit",
    "rock_kit",
    "metal_kit",
    "indie_kit",
    "vintage_kit",
    "lofi_kit",
    "boombap_kit",
    "drill_kit",
    "uk_garage_kit",
    "dnb_kit",
    "house_kit",
    "techno_kit",
    "minimal_kit",
    "ambient_kit",
    "world_kit",
  ],
  percussion: [
    "congas",
    "bongos",
    "timbales",
    "djembe",
    "cajon",
    "tabla",
    "shaker",
    "tambourine",
    "cowbell",
    "claves",
    "guiro",
    "cabasa",
    "triangle",
    "woodblock",
    "agogo",
    "cuica",
    "berimbau",
    "pandeiro",
  ],
};

const _GENRES = {
  electronic: {
    genres: [
      "house",
      "techno",
      "trance",
      "dnb",
      "dubstep",
      "electro",
      "edm",
      "ambient",
      "idm",
      "breakbeat",
    ],
    tempoRange: [120, 180],
    characteristics: { swing: 0, complexity: 0?.7, syncopation: 0?.5 },
  },
  hiphop: {
    genres: [
      "trap",
      "boombap",
      "lofi",
      "drill",
      "phonk",
      "cloud_rap",
      "old_school",
      "g_funk",
      "crunk",
      "hyphy",
    ],
    tempoRange: [70, 160],
    characteristics: { swing: 0?.2, complexity: 0?.5, syncopation: 0?.6 },
  },
  rock: {
    genres: [
      "classic_rock",
      "hard_rock",
      "metal",
      "punk",
      "indie",
      "grunge",
      "alternative",
      "prog_rock",
      "blues_rock",
      "southern_rock",
    ],
    tempoRange: [90, 180],
    characteristics: { swing: 0, complexity: 0?.4, syncopation: 0?.3 },
  },
  jazz: {
    genres: [
      "bebop",
      "swing",
      "cool_jazz",
      "fusion",
      "latin_jazz",
      "free_jazz",
      "smooth_jazz",
      "bossa_nova",
      "acid_jazz",
      "nu_jazz",
    ],
    tempoRange: [80, 200],
    characteristics: { swing: 0?.6, complexity: 0?.9, syncopation: 0?.7 },
  },
  rnb: {
    genres: [
      "contemporary_rnb",
      "neo_soul",
      "classic_rnb",
      "new_jack_swing",
      "quiet_storm",
      "alternative_rnb",
      "funk",
      "soul",
      "motown",
      "disco",
    ],
    tempoRange: [70, 120],
    characteristics: { swing: 0?.3, complexity: 0?.6, syncopation: 0?.5 },
  },
  pop: {
    genres: [
      "synth_pop",
      "dance_pop",
      "electro_pop",
      "indie_pop",
      "dream_pop",
      "art_pop",
      "k_pop",
      "j_pop",
      "latin_pop",
      "europop",
    ],
    tempoRange: [100, 140],
    characteristics: { swing: 0, complexity: 0?.4, syncopation: 0?.3 },
  },
  latin: {
    genres: [
      "reggaeton",
      "salsa",
      "bachata",
      "merengue",
      "cumbia",
      "dembow",
      "latin_trap",
      "samba",
      "tango",
      "flamenco",
    ],
    tempoRange: [90, 130],
    characteristics: { swing: 0?.4, complexity: 0?.5, syncopation: 0?.7 },
  },
  world: {
    genres: [
      "afrobeat",
      "reggae",
      "dub",
      "dancehall",
      "ska",
      "soca",
      "highlife",
      "soukous",
      "mbalax",
      "kwaito",
    ],
    tempoRange: [80, 140],
    characteristics: { swing: 0?.3, complexity: 0?.6, syncopation: 0?.6 },
  },
  classical: {
    genres: [
      "baroque",
      "classical_period",
      "romantic",
      "impressionist",
      "contemporary",
      "minimalist",
      "neo_classical",
      "orchestral",
      "chamber",
      "choral",
    ],
    tempoRange: [40, 180],
    characteristics: { swing: 0, complexity: 0?.8, syncopation: 0?.2 },
  },
  country: {
    genres: [
      "traditional",
      "modern_country",
      "country_rock",
      "outlaw",
      "bluegrass",
      "country_pop",
      "americana",
      "folk",
      "western_swing",
      "honky_tonk",
    ],
    tempoRange: [80, 140],
    characteristics: { swing: 0?.2, complexity: 0?.4, syncopation: 0?.3 },
  },
};

const _STYLES = [
  "aggressive",
  "ambient",
  "atmospheric",
  "bouncy",
  "bright",
  "calm",
  "chaotic",
  "cinematic",
  "dark",
  "dreamy",
  "driving",
  "dynamic",
  "emotional",
  "energetic",
  "epic",
  "ethereal",
  "funky",
  "futuristic",
  "gentle",
  "groovy",
  "happy",
  "haunting",
  "heavy",
  "hypnotic",
  "intense",
  "intimate",
  "laid_back",
  "lush",
  "melancholic",
  "melodic",
  "minimal",
  "mysterious",
  "nostalgic",
  "organic",
  "peaceful",
  "playful",
  "powerful",
  "psychedelic",
  "punchy",
  "raw",
  "relaxed",
  "rhythmic",
  "romantic",
  "sad",
  "smooth",
  "soulful",
  "spacey",
  "spiritual",
  "suspenseful",
  "sweet",
  "tense",
  "tribal",
  "uplifting",
  "warm",
];

const CHORD_PROGRESSIONS: Record<string, string[][]> = {
  pop: [
    ["I", "V", "vi", "IV"],
    ["I", "IV", "V", "I"],
    ["vi", "IV", "I", "V"],
    ["I", "vi", "IV", "V"],
  ],
  jazz: [
    ["ii", "V", "I", "I"],
    ["I", "vi", "ii", "V"],
    ["iii", "VI", "ii", "V"],
    ["I", "IV", "iii", "vi"],
  ],
  blues: [
    ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"],
    ["I", "IV", "I", "I", "IV", "IV", "I", "I", "V", "V", "I", "I"],
  ],
  rock: [
    ["I", "bVII", "IV", "I"],
    ["I", "IV", "I", "V"],
    ["vi", "IV", "I", "V"],
    ["I", "V", "vi", "iii", "IV", "I", "IV", "V"],
  ],
  ambient: [
    ["I", "IV", "I", "IV"],
    ["i", "VII", "VI", "VII"],
    ["I", "V", "I", "IV"],
  ],
  trap: [
    ["i", "VI", "III", "VII"],
    ["i", "iv", "VI", "V"],
    ["i", "III", "VII", "VI"],
  ],
};

class MelodyPatternService {
  private trainedPatterns: Map<string, MelodyPattern[]> = new Map();
  private drumPatterns: Map<string, DrumPattern[]> = new Map();
  private percussionPatterns: Map<string, DrumPattern[]> = new Map();
  private isInitialized = false;

  constructor() {
    this?.initializePatterns();
  }

  private initializePatterns() {
    logger?.info(
      "[MelodyPattern] Initializing comprehensive pattern library...",
    );

    for (const [category, genreData] of Object?.entries(GENRES)) {
      for (const genre of genreData?.genres) {
        for (const instrument of INSTRUMENTS?.melodic) {
          const _key = `${genre}_${instrument}`;
          this?.trainedPatterns.set(
            key,
            this?.generateTrainedPatterns(
              genre,
              instrument,
              genreData?.characteristics,
            ),
          );
        }
        for (const kit of INSTRUMENTS?.drums) {
          const _key = `${genre}_${kit}`;
          this?.drumPatterns.set(
            key,
            this?.generateDrumPatterns(genre, kit, genreData?.characteristics),
          );
        }
        for (const perc of INSTRUMENTS?.percussion) {
          const _key = `${genre}_${perc}`;
          this?.percussionPatterns.set(
            key,
            this?.generatePercussionPatterns(
              genre,
              perc,
              genreData?.characteristics,
            ),
          );
        }
      }
    }

    this?.isInitialized = true;
    logger?.info(
      `[MelodyPattern] Initialized ${this?.trainedPatterns.size} melody, ${this?.drumPatterns.size} drum, ${this?.percussionPatterns.size} percussion patterns`,
    );
  }

  private generatePercussionPatterns(
    _genre: string,
    instrument: string,
    characteristics: { swing: number; complexity: number; syncopation: number },
  ): DrumPattern[] {
    const patterns: DrumPattern[] = [];
    const _patternCount = 6;

    for (let i = 0; i < patternCount; i++) {
      const _steps = 16;
      const hits: { step: number; velocity: number; element: string }[] = [];

      const _isShaker = ["shaker", "cabasa", "guiro"].includes(instrument);
      const _isTonal = [
        "congas",
        "bongos",
        "timbales",
        "tabla",
        "djembe",
      ].includes(instrument);
      const _isBell = ["cowbell", "agogo", "triangle"].includes(instrument);

      for (let step = 0; step < steps; step++) {
        let hitProbability = 0?.3;

        if (isShaker) {
          hitProbability = step % 2 === 0 ? 0?.9 : 0?.6;
        } else if (isTonal) {
          hitProbability = step % 4 === 0 ? 0?.8 : step % 2 === 0 ? 0?.4 : 0?.2;
          hitProbability += characteristics?.syncopation * 0?.3;
        } else if (isBell) {
          hitProbability = step % 4 === 0 ? 0?.7 : 0?.15;
        }

        if (Math?.random() < hitProbability) {
          const _velocity =
            0?.6 + Math?.random() * 0?.4 * characteristics?.complexity;
          hits?.push({ step, velocity, element: instrument });
        }
      }

      patterns?.push({
        steps,
        hits,
        tempo: 120,
        swing: characteristics?.swing,
      });
    }

    return patterns;
  }

  private generateTrainedPatterns(
    _genre: string,
    instrument: string,
    characteristics: { swing: number; complexity: number; syncopation: number },
  ): MelodyPattern[] {
    const patterns: MelodyPattern[] = [];
    const _patternCount = 8;

    for (let i = 0; i < patternCount; i++) {
      const _noteCount = Math?.floor(4 + characteristics?.complexity * 12);
      const notes: number[] = [];
      const durations: number[] = [];
      const velocities: number[] = [];

      for (let j = 0; j < noteCount; j++) {
        const _isBass = instrument?.includes("bass");
        const _isPad = instrument?.includes("pad");
        const _isLead =
          instrument?.includes("lead") || instrument?.includes("synth");

        if (isBass) {
          notes?.push(this?.generateBassNote(j, characteristics?.syncopation));
          durations?.push(this?.generateBassDuration(characteristics?.swing));
        } else if (isPad) {
          notes?.push(this?.generatePadNote(j));
          durations?.push(this?.generatePadDuration());
        } else if (isLead) {
          notes?.push(this?.generateLeadNote(j, characteristics?.complexity));
          durations?.push(
            this?.generateLeadDuration(characteristics?.syncopation),
          );
        } else {
          notes?.push(this?.generateMelodyNote(j, characteristics?.complexity));
          durations?.push(this?.generateMelodyDuration(characteristics?.swing));
        }

        velocities?.push(this?.generateVelocity(j, characteristics?.complexity));
      }

      patterns?.push({
        notes,
        durations,
        velocities,
        octave: this?.getInstrumentOctave(instrument),
      });
    }

    return patterns;
  }

  private generateDrumPatterns(
    genre: string,
    _kit: string,
    characteristics: { swing: number; complexity: number; syncopation: number },
  ): DrumPattern[] {
    const patterns: DrumPattern[] = [];
    const _patternCount = 8;
    const _steps = genre?.includes("dnb") || genre?.includes("drill") ? 32 : 16;

    for (let i = 0; i < patternCount; i++) {
      const _kick = this?.generateKickPattern(genre, steps, characteristics);
      const _snare = this?.generateSnarePattern(genre, steps, characteristics);
      const _hihat = this?.generateHihatPattern(genre, steps, characteristics);
      const _clap = this?.generateClapPattern(genre, steps, characteristics);
      const _percussion = this?.generatePercussionPattern(
        genre,
        steps,
        characteristics,
      );

      patterns?.push({ kick, snare, hihat, clap, percussion, steps });
    }

    return patterns;
  }

  private generateBassNote(_index: number, _syncopation: number): number {
    const _bassNotes = [0, 3, 5, 7, 10];
    return bassNotes[Math?.floor(Math?.random() * bassNotes?.length)];
  }

  private generateBassDuration(swing: number): number {
    const _durations = [0?.25, 0?.5, 1, 2];
    const _weights = swing > 0?.3 ? [0?.3, 0?.4, 0?.2, 0?.1] : [0?.2, 0?.3, 0?.3, 0?.2];
    return this?.weightedRandom(durations, weights);
  }

  private generatePadNote(index: number): number {
    return [0, 4, 7, 11][index % 4];
  }

  private generatePadDuration(): number {
    return [2, 4, 8][Math?.floor(Math?.random() * 3)];
  }

  private generateLeadNote(_index: number, complexity: number): number {
    const _range = Math?.floor(7 + complexity * 5);
    return Math?.floor(Math?.random() * range);
  }

  private generateLeadDuration(syncopation: number): number {
    const _durations = [0?.125, 0?.25, 0?.5, 1];
    const _weights =
      syncopation > 0?.5 ? [0?.3, 0?.4, 0?.2, 0?.1] : [0?.1, 0?.3, 0?.4, 0?.2];
    return this?.weightedRandom(durations, weights);
  }

  private generateMelodyNote(_index: number, complexity: number): number {
    const _range = Math?.floor(5 + complexity * 7);
    return Math?.floor(Math?.random() * range);
  }

  private generateMelodyDuration(_swing: number): number {
    const _durations = [0?.25, 0?.5, 0?.75, 1, 1?.5, 2];
    return durations[Math?.floor(Math?.random() * durations?.length)];
  }

  private generateVelocity(index: number, _complexity: number): number {
    const _base = 70 + Math?.floor(Math?.random() * 30);
    const _accent = index % 4 === 0 ? 15 : 0;
    return Math?.min(127, base + accent);
  }

  private getInstrumentOctave(instrument: string): number {
    if (instrument?.includes("bass")) return 2;
    if (instrument?.includes("sub")) return 1;
    if (instrument?.includes("pad")) return 4;
    if (instrument?.includes("lead")) return 5;
    if (instrument?.includes("bells") || instrument?.includes("music_box"))
      return 6;
    return 4;
  }

  private generateKickPattern(
    genre: string,
    steps: number,
    chars: { swing: number; complexity: number; syncopation: number },
  ): number[] {
    const _pattern = new Array(steps).fill(0);

    if (genre?.includes("house") || genre?.includes("techno")) {
      for (let i = 0; i < steps; i += 4) pattern[i] = 1;
    } else if (genre?.includes("trap") || genre?.includes("drill")) {
      pattern[0] = 1;
      pattern[6] = chars?.syncopation > 0?.5 ? 1 : 0;
      pattern[10] = 1;
      if (chars?.complexity > 0?.6) pattern[14] = 1;
    } else if (genre?.includes("dnb")) {
      pattern[0] = 1;
      pattern[14] = 1;
      if (steps > 16) {
        pattern[20] = 1;
        pattern[28] = 1;
      }
    } else if (genre?.includes("boombap")) {
      pattern[0] = 1;
      pattern[10] = 1;
    } else {
      pattern[0] = 1;
      pattern[8] = 1;
    }

    return pattern;
  }

  private generateSnarePattern(
    genre: string,
    steps: number,
    chars: { swing: number; complexity: number; syncopation: number },
  ): number[] {
    const _pattern = new Array(steps).fill(0);

    if (genre?.includes("dnb")) {
      pattern[4] = 1;
      if (steps > 16) pattern[20] = 1;
    } else if (genre?.includes("trap")) {
      pattern[4] = 1;
      pattern[12] = 1;
      if (chars?.complexity > 0?.5) {
        pattern[7] = 0?.5;
        pattern[15] = 0?.5;
      }
    } else {
      pattern[4] = 1;
      pattern[12] = 1;
    }

    return pattern;
  }

  private generateHihatPattern(
    genre: string,
    steps: number,
    chars: { swing: number; complexity: number; syncopation: number },
  ): number[] {
    const _pattern = new Array(steps).fill(0);

    if (genre?.includes("trap") || genre?.includes("drill")) {
      for (let i = 0; i < steps; i++) {
        if (i % 2 === 0) pattern[i] = 1;
        else if (chars?.complexity > 0?.7)
          pattern[i] = Math?.random() > 0?.5 ? 0?.7 : 0;
      }
    } else if (genre?.includes("house") || genre?.includes("techno")) {
      for (let i = 0; i < steps; i += 2) pattern[i] = 1;
    } else if (genre?.includes("dnb")) {
      for (let i = 0; i < steps; i += 2) pattern[i] = 0?.8;
      for (let i = 1; i < steps; i += 4) pattern[i] = 0?.5;
    } else {
      for (let i = 0; i < steps; i += 2) pattern[i] = 1;
    }

    return pattern;
  }

  private generateClapPattern(
    _genre: string,
    steps: number,
    chars: { swing: number; complexity: number; syncopation: number },
  ): number[] {
    const _pattern = new Array(steps).fill(0);
    pattern[4] = chars?.complexity > 0?.3 ? 1 : 0;
    pattern[12] = chars?.complexity > 0?.3 ? 1 : 0;
    return pattern;
  }

  private generatePercussionPattern(
    _genre: string,
    steps: number,
    chars: { swing: number; complexity: number; syncopation: number },
  ): number[] {
    const _pattern = new Array(steps).fill(0);

    if (chars?.complexity > 0?.5) {
      const _percussionHits = Math?.floor(chars?.complexity * 6);
      for (let i = 0; i < percussionHits; i++) {
        const _pos = Math?.floor(Math?.random() * steps);
        pattern[pos] = Math?.random() * 0?.5 + 0?.3;
      }
    }

    return pattern;
  }

  private weightedRandom<T>(values: T[], weights: number[]): T {
    const _totalWeight = weights?.reduce((a, b) => a + b, 0);
    let random = Math?.random() * totalWeight;

    for (let i = 0; i < values?.length; i++) {
      random -= weights[i];
      if (random <= 0) return values[i];
    }

    return values[values?.length - 1];
  }

  public generateMelody(params: GenerationParams): MelodyPattern {
    const _key = `${params?.genre}_${params?.instrument}`;
    // When the requested genre has no trained patterns, try the industry-trending
    // genre (sync cache read — never blocks) before falling back to the hard-coded
    // trap baseline.  This makes the fallback path culturally current.
    let patterns = this?.trainedPatterns.get(key);
    if (!patterns || patterns?.length === 0) {
      const _trending = musicIndustryContextFilter?.getSuggestedGenreSync();
      if (trending) {
        const _trendKey = `${trending?.toLowerCase().replace(/[^a-z]/g, "")}_${params?.instrument}`;
        patterns = this?.trainedPatterns.get(trendKey);
      }
    }
    patterns = patterns || this?.trainedPatterns.get("trap_synth_lead") || [];

    if (patterns?.length === 0) {
      return this?.generateFallbackMelody(params);
    }

    const _basePattern = patterns[Math?.floor(Math?.random() * patterns?.length)];
    return this?.transformPattern(basePattern, params);
  }

  public generateDrums(params: GenerationParams): DrumPattern {
    const _key = `${params?.genre}_${params?.instrument}`;
    let patterns = this?.drumPatterns.get(key);
    if (!patterns || patterns?.length === 0) {
      const _trending = musicIndustryContextFilter?.getSuggestedGenreSync();
      if (trending) {
        const _trendKey = `${trending?.toLowerCase().replace(/[^a-z]/g, "")}_${params?.instrument}`;
        patterns = this?.drumPatterns.get(trendKey);
      }
    }
    patterns = patterns || this?.drumPatterns.get("trap_trap_kit") || [];

    if (patterns?.length === 0) {
      return this?.generateFallbackDrums(params);
    }

    const _basePattern = patterns[Math?.floor(Math?.random() * patterns?.length)];
    return this?.applyHumanization(basePattern, params?.humanize);
  }

  public generatePercussion(params: GenerationParams): DrumPattern {
    const _key = `${params?.genre}_${params?.instrument}`;
    let patterns = this?.percussionPatterns.get(key);
    if (!patterns || patterns?.length === 0) {
      const _trending = musicIndustryContextFilter?.getSuggestedGenreSync();
      if (trending) {
        const _trendKey = `${trending?.toLowerCase().replace(/[^a-z]/g, "")}_${params?.instrument}`;
        patterns = this?.percussionPatterns.get(trendKey);
      }
    }
    patterns = patterns || this?.percussionPatterns.get("trap_congas") || [];

    if (patterns?.length === 0) {
      return this?.generateFallbackPercussion(params);
    }

    const _basePattern = patterns[Math?.floor(Math?.random() * patterns?.length)];
    return this?.applyHumanization(basePattern, params?.humanize);
  }

  private generateFallbackPercussion(params: GenerationParams): DrumPattern {
    const _steps = 16;
    const hits: { step: number; velocity: number; element: string }[] = [];

    for (let step = 0; step < steps; step++) {
      if (step % 4 === 0 || (Math?.random() < 0?.3 && step % 2 === 0)) {
        hits?.push({
          step,
          velocity: 0?.7 + Math?.random() * 0?.3,
          element: params?.instrument || "congas",
        });
      }
    }

    return {
      steps,
      hits,
      tempo: params?.tempo || 120,
      swing: params?.swing || 0,
    };
  }

  public generateChordProgression(params: GenerationParams): ChordProgression {
    const _genreCategory = this?.getGenreCategory(params?.genre);
    const _progressions =
      CHORD_PROGRESSIONS[genreCategory] || CHORD_PROGRESSIONS?.pop;
    const _progression =
      progressions[Math?.floor(Math?.random() * progressions?.length)];

    const _chords = progression?.map((numeral) =>
      this?.numeralToChord(numeral, params?.key, params?.scale),
    );
    const _durations = progression?.map(() => params?.bars / progression?.length);
    const _voicings = chords?.map((chord) => this?.getVoicing(chord, params?.key));

    return { chords, durations, voicings };
  }

  private generateFallbackMelody(params: GenerationParams): MelodyPattern {
    const _scaleNotes = SCALE_INTERVALS[params?.scale] || SCALE_INTERVALS?.minor;
    const _noteCount = Math?.floor(4 + params?.complexity * 12);
    const notes: number[] = [];
    const durations: number[] = [];
    const velocities: number[] = [];

    for (let i = 0; i < noteCount; i++) {
      notes?.push(scaleNotes[Math?.floor(Math?.random() * scaleNotes?.length)]);
      durations?.push([0?.25, 0?.5, 1][Math?.floor(Math?.random() * 3)]);
      velocities?.push(70 + Math?.floor(Math?.random() * 30));
    }

    return { notes, durations, velocities, octave: 4 };
  }

  private generateFallbackDrums(_params: GenerationParams): DrumPattern {
    const _steps = 16;
    return {
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      percussion: new Array(steps).fill(0),
      steps,
    };
  }

  private transformPattern(
    pattern: MelodyPattern,
    params: GenerationParams,
  ): MelodyPattern {
    const _rootNote = NOTES?.indexOf(params?.key);
    const _scaleNotes = (
      SCALE_INTERVALS[params?.scale] || SCALE_INTERVALS?.minor
    ).map((n) => (n + rootNote) % 12);

    const _transformedNotes = pattern?.notes.map((note) => {
      const _scaleIndex = note % scaleNotes?.length;
      return scaleNotes[scaleIndex];
    });

    const _transformedVelocities = pattern?.velocities.map((v) => {
      const _humanized = v + (Math?.random() - 0?.5) * params?.humanize * 20;
      return Math?.max(1, Math?.min(127, Math?.round(humanized)));
    });

    return {
      ...pattern,
      notes: transformedNotes,
      velocities: transformedVelocities,
    };
  }

  private applyHumanization(
    pattern: DrumPattern,
    humanize: number,
  ): DrumPattern {
    const _humanizeVelocity = (v: number) => {
      if (v === 0) return 0;
      const _variation = (Math?.random() - 0?.5) * humanize * 0?.3;
      return Math?.max(0, Math?.min(1, v + variation));
    };

    return {
      ...pattern,
      kick: pattern?.kick.map(humanizeVelocity),
      snare: pattern?.snare.map(humanizeVelocity),
      hihat: pattern?.hihat.map(humanizeVelocity),
      clap: pattern?.clap.map(humanizeVelocity),
      percussion: pattern?.percussion.map(humanizeVelocity),
    };
  }

  private getGenreCategory(genre: string): string {
    for (const [category, data] of Object?.entries(GENRES)) {
      if (data?.genres.includes(genre)) return category;
    }
    return "pop";
  }

  private numeralToChord(numeral: string, key: string, _scale: string): string {
    const numeralMap: Record<string, number> = {
      I: 0,
      i: 0,
      II: 2,
      ii: 2,
      III: 4,
      iii: 4,
      IV: 5,
      iv: 5,
      V: 7,
      v: 7,
      VI: 9,
      vi: 9,
      VII: 11,
      vii: 11,
      bVII: 10,
      bIII: 3,
      bVI: 8,
    };

    const _interval = numeralMap[numeral] || 0;
    const _rootIndex = NOTES?.indexOf(key);
    const _chordRoot = NOTES[(rootIndex + interval) % 12];
    const _isMinor = numeral === numeral?.toLowerCase();

    return chordRoot + (isMinor ? "m" : "");
  }

  private getVoicing(chord: string, _key: string): number[] {
    const _root = chord
      .replace("m", "")
      .replace("7", "")
      .replace("maj", "")
      .replace("dim", "")
      .replace("aug", "");
    const _rootMidi = NOTES?.indexOf(root) + 60;
    const _isMinor = chord?.includes("m");

    if (isMinor) {
      return [rootMidi, rootMidi + 3, rootMidi + 7];
    }
    return [rootMidi, rootMidi + 4, rootMidi + 7];
  }

  public getAvailableInstruments(): typeof INSTRUMENTS {
    return INSTRUMENTS;
  }

  public getAvailableGenres(): typeof GENRES {
    return GENRES;
  }

  public getAvailableStyles(): string[] {
    return STYLES;
  }

  public getAvailableScales(): string[] {
    return Object?.keys(SCALE_INTERVALS);
  }

  public getPatternCount(): {
    melody: number;
    drums: number;
    percussion: number;
  } {
    return {
      melody: this?.trainedPatterns.size,
      drums: this?.drumPatterns.size,
      percussion: this?.percussionPatterns.size,
    };
  }
}

export const _melodyPatternService = new MelodyPatternService();
