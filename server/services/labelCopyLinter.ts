import { logger } from '../logger.js';

export interface LintError {
  field: string;
  message: string;
  severity: 'error' | 'critical';
  code: string;
}

export interface LintWarning {
  field: string;
  message: string;
  severity: 'warning' | 'info';
  code: string;
  suggestion?: string;
}

export interface FixSuggestion {
  field: string;
  original: string;
  suggested: string;
  reason: string;
  autoFixable: boolean;
}

export interface LintResult {
  valid: boolean;
  errors: LintError[];
  warnings: LintWarning[];
  score: number;
  breakdown: {
    metadata: number;
    formatting: number;
    compliance: number;
    completeness: number;
  };
  dspCompatibility: {
    [dsp: string]: { compatible: boolean; issues: string[] };
  };
}

export interface ReleaseMetadata {
  title: string;
  artist: string;
  albumArtist?: string;
  genre?: string;
  subGenre?: string;
  releaseDate?: Date | string;
  releaseType?: 'single' | 'EP' | 'album' | 'compilation';
  label?: string;
  copyrightHolder?: string;
  copyrightYear?: number;
  publishingHolder?: string;
  upc?: string;
  isExplicit?: boolean;
  language?: string;
  originalReleaseDate?: Date | string;
  recordingLocation?: string;
  productionCredits?: string;
  tracks?: TrackMetadata[];
  coverArt?: {
    url?: string;
    width?: number;
    height?: number;
    format?: string;
    fileSize?: number;
  };
}

export interface TrackMetadata {
  title: string;
  artist: string;
  featuredArtists?: string[];
  isrc?: string;
  duration?: number;
  trackNumber?: number;
  discNumber?: number;
  isExplicit?: boolean;
  lyrics?: string;
  lyricsLanguage?: string;
  composers?: string[];
  producers?: string[];
  mixEngineers?: string[];
  masteringEngineers?: string[];
  genre?: string;
}

const DSP_CHAR_LIMITS: { [dsp: string]: { [field: string]: number } } = {
  spotify: {
    title: 200,
    artist: 100,
    albumArtist: 100,
    label: 100,
    genre: 50,
  },
  appleMusic: {
    title: 256,
    artist: 256,
    albumArtist: 256,
    label: 256,
    genre: 50,
  },
  amazonMusic: {
    title: 250,
    artist: 250,
    albumArtist: 250,
    label: 100,
    genre: 50,
  },
  youtubeMusic: {
    title: 100,
    artist: 100,
    albumArtist: 100,
    label: 100,
    genre: 50,
  },
  tidal: {
    title: 200,
    artist: 200,
    albumArtist: 200,
    label: 100,
    genre: 50,
  },
  deezer: {
    title: 200,
    artist: 200,
    albumArtist: 200,
    label: 100,
    genre: 50,
  },
};

const EXPLICIT_TERMS = [
  'fuck', 'shit', 'bitch', 'ass', 'damn', 'hell', 'crap', 'bastard',
  'cock', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'nigga', 'nigger',
  'faggot', 'retard', 'motherfucker', 'bullshit'
];

const BANNED_TITLE_PATTERNS = [
  /\bkaraoke\b/i,
  /\bcover version\b/i,
  /\bin the style of\b/i,
  /\boriginally performed by\b/i,
  /\btribute to\b/i,
  /\bsoundalike\b/i,
  /\bmade famous by\b/i,
  /\bas performed by\b/i,
  /\binstrumental version\b/i,
  /\bremake\b/i,
];

const VALID_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'bn', 'pa', 'ta', 'te', 'mr', 'gu', 'kn', 'ml',
  'th', 'vi', 'id', 'ms', 'tl', 'pl', 'uk', 'cs', 'hu', 'ro',
  'el', 'he', 'tr', 'fa', 'sv', 'no', 'da', 'fi', 'zu', 'sw'
];

const VALID_GENRES = [
  'Pop', 'Rock', 'Hip-Hop/Rap', 'R&B/Soul', 'Electronic', 'Dance',
  'Country', 'Jazz', 'Classical', 'Blues', 'Reggae', 'Latin',
  'World', 'Folk', 'Alternative', 'Indie', 'Metal', 'Punk',
  'Ambient', 'Soundtrack', 'Spoken Word', 'Comedy', 'Children\'s',
  'Christian', 'Gospel', 'New Age', 'Easy Listening', 'Instrumental',
  'K-Pop', 'J-Pop', 'Afrobeats', 'Drill', 'Trap', 'House', 'Techno'
];

export class LabelCopyLinter {
  private containsExplicitContent(text: string): boolean {
    const lowerText = text.toLowerCase();
    return EXPLICIT_TERMS.some(term => lowerText.includes(term));
  }

  private detectLanguage(text: string): string {
    const charPatterns: { [lang: string]: RegExp } = {
      'ja': /[\u3040-\u309F\u30A0-\u30FF]/,
      'ko': /[\uAC00-\uD7AF]/,
      'zh': /[\u4E00-\u9FFF]/,
      'ar': /[\u0600-\u06FF]/,
      'he': /[\u0590-\u05FF]/,
      'ru': /[\u0400-\u04FF]/,
      'th': /[\u0E00-\u0E7F]/,
      'hi': /[\u0900-\u097F]/,
    };

    for (const [lang, pattern] of Object.entries(charPatterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    return 'en';
  }

  private validateTitle(title: string, isTrack: boolean = false): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];
    const fieldName = isTrack ? 'trackTitle' : 'title';

    if (!title || title.trim().length === 0) {
      errors.push({
        field: fieldName,
        message: 'Title is required',
        severity: 'critical',
        code: 'TITLE_REQUIRED'
      });
      return { errors, warnings };
    }

    if (title.length < 2) {
      errors.push({
        field: fieldName,
        message: 'Title must be at least 2 characters',
        severity: 'error',
        code: 'TITLE_TOO_SHORT'
      });
    }

    for (const pattern of BANNED_TITLE_PATTERNS) {
      if (pattern.test(title)) {
        errors.push({
          field: fieldName,
          message: `Title contains banned term matching "${pattern.source}"`,
          severity: 'error',
          code: 'TITLE_BANNED_TERM'
        });
      }
    }

    if (/^\s|\s$/.test(title)) {
      warnings.push({
        field: fieldName,
        message: 'Title has leading or trailing whitespace',
        severity: 'warning',
        code: 'TITLE_WHITESPACE',
        suggestion: 'Remove leading/trailing whitespace'
      });
    }

    if (/\s{2,}/.test(title)) {
      warnings.push({
        field: fieldName,
        message: 'Title contains multiple consecutive spaces',
        severity: 'warning',
        code: 'TITLE_MULTIPLE_SPACES',
        suggestion: 'Replace multiple spaces with single space'
      });
    }

    if (title === title.toUpperCase() && title.length > 3) {
      warnings.push({
        field: fieldName,
        message: 'Title is in all uppercase',
        severity: 'warning',
        code: 'TITLE_ALL_CAPS',
        suggestion: 'Use title case for better readability'
      });
    }

    if (/[!?]{2,}/.test(title)) {
      warnings.push({
        field: fieldName,
        message: 'Title contains excessive punctuation',
        severity: 'info',
        code: 'TITLE_EXCESSIVE_PUNCTUATION'
      });
    }

    return { errors, warnings };
  }

  private validateArtist(artist: string): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!artist || artist.trim().length === 0) {
      errors.push({
        field: 'artist',
        message: 'Artist name is required',
        severity: 'critical',
        code: 'ARTIST_REQUIRED'
      });
      return { errors, warnings };
    }

    if (/^(various|unknown|n\/a|tbd|tba)$/i.test(artist.trim())) {
      errors.push({
        field: 'artist',
        message: 'Invalid artist name placeholder',
        severity: 'error',
        code: 'ARTIST_INVALID_NAME'
      });
    }

    if (artist.includes('/') || artist.includes('&')) {
      warnings.push({
        field: 'artist',
        message: 'Consider using featured artist field instead of combining artists in name',
        severity: 'info',
        code: 'ARTIST_MULTIPLE_IN_NAME',
        suggestion: 'Use separate artist and featured artist fields'
      });
    }

    return { errors, warnings };
  }

  private validateGenre(genre?: string): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!genre || genre.trim().length === 0) {
      errors.push({
        field: 'genre',
        message: 'Genre is required for distribution',
        severity: 'error',
        code: 'GENRE_REQUIRED'
      });
      return { errors, warnings };
    }

    const normalizedGenre = genre.toLowerCase().trim();
    const validGenresLower = VALID_GENRES.map(g => g.toLowerCase());
    
    if (!validGenresLower.includes(normalizedGenre)) {
      warnings.push({
        field: 'genre',
        message: `Genre "${genre}" may not be recognized by all DSPs`,
        severity: 'warning',
        code: 'GENRE_NOT_STANDARD',
        suggestion: `Consider using a standard genre like: ${VALID_GENRES.slice(0, 5).join(', ')}`
      });
    }

    return { errors, warnings };
  }

  private validateReleaseDate(releaseDate?: Date | string): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!releaseDate) {
      errors.push({
        field: 'releaseDate',
        message: 'Release date is required',
        severity: 'error',
        code: 'RELEASE_DATE_REQUIRED'
      });
      return { errors, warnings };
    }

    const date = new Date(releaseDate);
    if (isNaN(date.getTime())) {
      errors.push({
        field: 'releaseDate',
        message: 'Invalid release date format',
        severity: 'error',
        code: 'RELEASE_DATE_INVALID'
      });
      return { errors, warnings };
    }

    const now = new Date();
    const minFutureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    if (date < now) {
      warnings.push({
        field: 'releaseDate',
        message: 'Release date is in the past. Some DSPs require future dates.',
        severity: 'warning',
        code: 'RELEASE_DATE_PAST'
      });
    } else if (date < minFutureDate) {
      warnings.push({
        field: 'releaseDate',
        message: 'Release date is less than 7 days away. Some DSPs require longer lead times.',
        severity: 'warning',
        code: 'RELEASE_DATE_SHORT_LEAD',
        suggestion: 'Consider scheduling at least 2-4 weeks in advance for better playlist consideration'
      });
    }

    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 5) {
      warnings.push({
        field: 'releaseDate',
        message: 'Release date is not a Friday. Industry standard is Friday releases.',
        severity: 'info',
        code: 'RELEASE_DATE_NOT_FRIDAY',
        suggestion: 'Consider releasing on Friday for maximum chart potential'
      });
    }

    return { errors, warnings };
  }

  private validateCopyright(release: ReleaseMetadata): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!release.copyrightHolder) {
      errors.push({
        field: 'copyrightHolder',
        message: 'Copyright holder (℗) is required',
        severity: 'error',
        code: 'COPYRIGHT_HOLDER_REQUIRED'
      });
    }

    if (!release.copyrightYear) {
      errors.push({
        field: 'copyrightYear',
        message: 'Copyright year is required',
        severity: 'error',
        code: 'COPYRIGHT_YEAR_REQUIRED'
      });
    } else {
      const currentYear = new Date().getFullYear();
      if (release.copyrightYear < 1900 || release.copyrightYear > currentYear + 1) {
        errors.push({
          field: 'copyrightYear',
          message: `Copyright year must be between 1900 and ${currentYear + 1}`,
          severity: 'error',
          code: 'COPYRIGHT_YEAR_INVALID'
        });
      }
    }

    if (!release.publishingHolder) {
      warnings.push({
        field: 'publishingHolder',
        message: 'Publishing rights holder (©) is recommended',
        severity: 'warning',
        code: 'PUBLISHING_HOLDER_MISSING',
        suggestion: 'Add publishing rights information for complete metadata'
      });
    }

    return { errors, warnings };
  }

  private validateLabel(label?: string): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!label || label.trim().length === 0) {
      warnings.push({
        field: 'label',
        message: 'Label name is recommended. Will default to artist name.',
        severity: 'info',
        code: 'LABEL_MISSING',
        suggestion: 'Add a label name for professional presentation'
      });
    }

    return { errors, warnings };
  }

  private validateLanguage(language?: string): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!language) {
      warnings.push({
        field: 'language',
        message: 'Primary language is recommended',
        severity: 'warning',
        code: 'LANGUAGE_MISSING'
      });
      return { errors, warnings };
    }

    const normalizedLang = language.toLowerCase().substring(0, 2);
    if (!VALID_LANGUAGES.includes(normalizedLang)) {
      warnings.push({
        field: 'language',
        message: `Language code "${language}" may not be recognized`,
        severity: 'warning',
        code: 'LANGUAGE_UNRECOGNIZED'
      });
    }

    return { errors, warnings };
  }

  private validateExplicitContent(release: ReleaseMetadata): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    const textToCheck = [
      release.title,
      release.artist,
      ...(release.tracks?.map(t => t.title) || []),
      ...(release.tracks?.flatMap(t => t.lyrics ? [t.lyrics] : []) || [])
    ].filter(Boolean).join(' ');

    const hasExplicitContent = this.containsExplicitContent(textToCheck);

    if (hasExplicitContent && !release.isExplicit) {
      warnings.push({
        field: 'isExplicit',
        message: 'Content appears to contain explicit language but is not marked as explicit',
        severity: 'warning',
        code: 'EXPLICIT_NOT_FLAGGED',
        suggestion: 'Mark the release as explicit to avoid DSP compliance issues'
      });
    }

    return { errors, warnings };
  }

  private validateTracks(tracks?: TrackMetadata[]): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!tracks || tracks.length === 0) {
      errors.push({
        field: 'tracks',
        message: 'At least one track is required',
        severity: 'critical',
        code: 'TRACKS_REQUIRED'
      });
      return { errors, warnings };
    }

    const trackNumbers = tracks.map(t => t.trackNumber).filter(Boolean);
    const uniqueNumbers = new Set(trackNumbers);
    if (trackNumbers.length !== uniqueNumbers.size) {
      errors.push({
        field: 'tracks',
        message: 'Duplicate track numbers found',
        severity: 'error',
        code: 'TRACKS_DUPLICATE_NUMBERS'
      });
    }

    tracks.forEach((track, index) => {
      const { errors: titleErrors, warnings: titleWarnings } = this.validateTitle(track.title, true);
      errors.push(...titleErrors.map(e => ({ ...e, field: `tracks[${index}].${e.field}` })));
      warnings.push(...titleWarnings.map(w => ({ ...w, field: `tracks[${index}].${w.field}` })));

      if (!track.isrc) {
        warnings.push({
          field: `tracks[${index}].isrc`,
          message: `Track "${track.title}" is missing ISRC code`,
          severity: 'warning',
          code: 'TRACK_ISRC_MISSING'
        });
      }

      if (!track.duration || track.duration < 30) {
        warnings.push({
          field: `tracks[${index}].duration`,
          message: `Track "${track.title}" is very short (${track.duration || 0}s). May not qualify for streaming royalties.`,
          severity: 'warning',
          code: 'TRACK_SHORT_DURATION'
        });
      }
    });

    return { errors, warnings };
  }

  private validateCoverArt(coverArt?: ReleaseMetadata['coverArt']): { errors: LintError[]; warnings: LintWarning[] } {
    const errors: LintError[] = [];
    const warnings: LintWarning[] = [];

    if (!coverArt || !coverArt.url) {
      errors.push({
        field: 'coverArt',
        message: 'Cover art is required for distribution',
        severity: 'critical',
        code: 'COVER_ART_REQUIRED'
      });
      return { errors, warnings };
    }

    if (coverArt.width && coverArt.height) {
      if (coverArt.width !== coverArt.height) {
        errors.push({
          field: 'coverArt',
          message: 'Cover art must be square (1:1 aspect ratio)',
          severity: 'error',
          code: 'COVER_ART_NOT_SQUARE'
        });
      }

      if (coverArt.width < 3000 || coverArt.height < 3000) {
        errors.push({
          field: 'coverArt',
          message: `Cover art must be at least 3000x3000 pixels. Current: ${coverArt.width}x${coverArt.height}`,
          severity: 'error',
          code: 'COVER_ART_TOO_SMALL'
        });
      }
    }

    if (coverArt.format && !['jpg', 'jpeg', 'png'].includes(coverArt.format.toLowerCase())) {
      errors.push({
        field: 'coverArt',
        message: 'Cover art must be JPG or PNG format',
        severity: 'error',
        code: 'COVER_ART_INVALID_FORMAT'
      });
    }

    if (coverArt.fileSize && coverArt.fileSize > 10 * 1024 * 1024) {
      warnings.push({
        field: 'coverArt',
        message: 'Cover art file size exceeds 10MB',
        severity: 'warning',
        code: 'COVER_ART_LARGE_FILE',
        suggestion: 'Compress the image to reduce file size'
      });
    }

    return { errors, warnings };
  }

  private calculateScore(errors: LintError[], warnings: LintWarning[]): { 
    score: number; 
    breakdown: LintResult['breakdown'] 
  } {
    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const regularErrors = errors.filter(e => e.severity === 'error').length;
    const warningsCount = warnings.filter(w => w.severity === 'warning').length;
    const infoCount = warnings.filter(w => w.severity === 'info').length;

    const basePenalty = criticalErrors * 25 + regularErrors * 10 + warningsCount * 3 + infoCount * 1;
    const score = Math.max(0, 100 - basePenalty);

    const breakdown = {
      metadata: Math.max(0, 100 - (criticalErrors * 20 + regularErrors * 10)),
      formatting: Math.max(0, 100 - (warningsCount * 5)),
      compliance: criticalErrors === 0 ? 100 : 0,
      completeness: Math.max(0, 100 - (warningsCount * 2 + infoCount))
    };

    return { score: Math.round(score), breakdown };
  }

  private checkDSPCompatibility(release: ReleaseMetadata): LintResult['dspCompatibility'] {
    const compatibility: LintResult['dspCompatibility'] = {};

    for (const [dsp, limits] of Object.entries(DSP_CHAR_LIMITS)) {
      const issues: string[] = [];

      if (release.title && release.title.length > limits.title) {
        issues.push(`Title exceeds ${dsp} limit of ${limits.title} characters`);
      }

      if (release.artist && release.artist.length > limits.artist) {
        issues.push(`Artist name exceeds ${dsp} limit of ${limits.artist} characters`);
      }

      if (release.label && release.label.length > limits.label) {
        issues.push(`Label name exceeds ${dsp} limit of ${limits.label} characters`);
      }

      compatibility[dsp] = {
        compatible: issues.length === 0,
        issues
      };
    }

    return compatibility;
  }

  lint(release: ReleaseMetadata): LintResult {
    const allErrors: LintError[] = [];
    const allWarnings: LintWarning[] = [];

    const validations = [
      this.validateTitle(release.title),
      this.validateArtist(release.artist),
      this.validateGenre(release.genre),
      this.validateReleaseDate(release.releaseDate),
      this.validateCopyright(release),
      this.validateLabel(release.label),
      this.validateLanguage(release.language),
      this.validateExplicitContent(release),
      this.validateTracks(release.tracks),
      this.validateCoverArt(release.coverArt)
    ];

    validations.forEach(({ errors, warnings }) => {
      allErrors.push(...errors);
      allWarnings.push(...warnings);
    });

    const { score, breakdown } = this.calculateScore(allErrors, allWarnings);
    const dspCompatibility = this.checkDSPCompatibility(release);

    const result: LintResult = {
      valid: allErrors.filter(e => e.severity === 'critical').length === 0,
      errors: allErrors,
      warnings: allWarnings,
      score,
      breakdown,
      dspCompatibility
    };

    logger.info(`Label copy lint completed: score=${score}, errors=${allErrors.length}, warnings=${allWarnings.length}`);

    return result;
  }

  validateForDSP(release: ReleaseMetadata, dsp: string): LintResult {
    const baseResult = this.lint(release);
    
    const dspLimits = DSP_CHAR_LIMITS[dsp.toLowerCase()];
    if (!dspLimits) {
      return baseResult;
    }

    const dspErrors: LintError[] = [];
    const dspWarnings: LintWarning[] = [];

    if (release.title && release.title.length > dspLimits.title) {
      dspErrors.push({
        field: 'title',
        message: `Title exceeds ${dsp} limit of ${dspLimits.title} characters (current: ${release.title.length})`,
        severity: 'error',
        code: 'DSP_TITLE_TOO_LONG'
      });
    }

    if (release.artist && release.artist.length > dspLimits.artist) {
      dspErrors.push({
        field: 'artist',
        message: `Artist name exceeds ${dsp} limit of ${dspLimits.artist} characters`,
        severity: 'error',
        code: 'DSP_ARTIST_TOO_LONG'
      });
    }

    return {
      ...baseResult,
      errors: [...baseResult.errors, ...dspErrors],
      warnings: [...baseResult.warnings, ...dspWarnings],
      valid: baseResult.valid && dspErrors.length === 0
    };
  }

  suggestFixes(errors: LintError[]): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];

    for (const error of errors) {
      switch (error.code) {
        case 'TITLE_WHITESPACE':
          suggestions.push({
            field: error.field,
            original: '',
            suggested: 'Trim whitespace',
            reason: 'Remove leading and trailing spaces',
            autoFixable: true
          });
          break;

        case 'TITLE_MULTIPLE_SPACES':
          suggestions.push({
            field: error.field,
            original: '',
            suggested: 'Replace multiple spaces with single space',
            reason: 'Normalize spacing',
            autoFixable: true
          });
          break;

        case 'TITLE_ALL_CAPS':
          suggestions.push({
            field: error.field,
            original: '',
            suggested: 'Convert to title case',
            reason: 'Better readability and DSP compliance',
            autoFixable: true
          });
          break;

        case 'GENRE_REQUIRED':
          suggestions.push({
            field: 'genre',
            original: '',
            suggested: 'Pop',
            reason: 'Default genre for broad distribution',
            autoFixable: false
          });
          break;

        case 'RELEASE_DATE_NOT_FRIDAY':
          suggestions.push({
            field: 'releaseDate',
            original: '',
            suggested: 'Change to upcoming Friday',
            reason: 'Industry standard release day',
            autoFixable: true
          });
          break;
      }
    }

    return suggestions;
  }

  autoFix(release: ReleaseMetadata): { fixed: ReleaseMetadata; appliedFixes: string[] } {
    const appliedFixes: string[] = [];
    const fixed = { ...release };

    if (fixed.title) {
      const originalTitle = fixed.title;
      fixed.title = fixed.title.trim().replace(/\s+/g, ' ');
      if (fixed.title !== originalTitle) {
        appliedFixes.push('Normalized title whitespace');
      }
    }

    if (fixed.artist) {
      const originalArtist = fixed.artist;
      fixed.artist = fixed.artist.trim().replace(/\s+/g, ' ');
      if (fixed.artist !== originalArtist) {
        appliedFixes.push('Normalized artist whitespace');
      }
    }

    if (fixed.tracks) {
      fixed.tracks = fixed.tracks.map((track, index) => {
        const originalTitle = track.title;
        const fixedTitle = track.title?.trim().replace(/\s+/g, ' ');
        if (fixedTitle !== originalTitle) {
          appliedFixes.push(`Normalized track ${index + 1} title whitespace`);
        }
        return { ...track, title: fixedTitle || track.title };
      });
    }

    return { fixed, appliedFixes };
  }
}

export const labelCopyLinter = new LabelCopyLinter();
