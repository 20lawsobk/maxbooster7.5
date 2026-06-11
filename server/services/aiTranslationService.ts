import { logger } from "../logger.js";

export interface TranslatedContent {
  language: string;
  languageCode: string;
  content: string;
  headline?: string;
  hashtags: string[];
  culturalNotes: string[];
  confidence: number;
}

export interface TranslationRequest {
  content: string;
  headline?: string;
  hashtags?: string[];
  sourceLanguage?: string;
  targetLanguages: string[];
  preserveTone?: boolean;
  adaptForPlatform?: string;
}

const LANGUAGE_DATA: Record<
  string,
  {
    name: string;
    nativeName: string;
    culturalNotes: string[];
    commonPhrases: Record<string, string>;
    emojiCulture: "conservative" | "moderate" | "expressive";
    formalityPreference: "formal" | "informal" | "mixed";
    hashtagStyle: "english" | "native" | "mixed";
  }
> = {
  en: {
    name: "English",
    nativeName: "English",
    culturalNotes: [
      "Use contractions for casual tone",
      "Abbreviations widely understood",
    ],
    commonPhrases: {},
    emojiCulture: "moderate",
    formalityPreference: "mixed",
    hashtagStyle: "english",
  },
  es: {
    name: "Spanish",
    nativeName: "Español",
    culturalNotes: [
      "Use inverted punctuation ¡! ¿?",
      "Vosotros for Spain, Ustedes for Latin America",
      "Diminutives are endearing (ito/ita)",
    ],
    commonPhrases: {
      "new music": "nueva música",
      "out now": "ya disponible",
      "check it out": "¡escúchalo ya!",
      "link in bio": "enlace en bio",
      "stream now": "escucha ahora",
      "let me know": "cuéntame qué te parece",
    },
    emojiCulture: "expressive",
    formalityPreference: "informal",
    hashtagStyle: "mixed",
  },
  fr: {
    name: "French",
    nativeName: "Français",
    culturalNotes: [
      'Use formal "vous" for wider audience',
      "Accents are essential (é, è, ê, à)",
      "French audiences appreciate elegance",
    ],
    commonPhrases: {
      "new music": "nouvelle musique",
      "out now": "disponible maintenant",
      "check it out": "écoutez maintenant",
      "link in bio": "lien en bio",
      "stream now": "écoutez maintenant",
      "let me know": "dites-moi ce que vous en pensez",
    },
    emojiCulture: "moderate",
    formalityPreference: "formal",
    hashtagStyle: "mixed",
  },
  de: {
    name: "German",
    nativeName: "Deutsch",
    culturalNotes: [
      "Capitalize all nouns",
      'Use formal "Sie" for professional content',
      "Germans value directness and quality",
    ],
    commonPhrases: {
      "new music": "neue Musik",
      "out now": "jetzt draußen",
      "check it out": "hör es dir an",
      "link in bio": "Link in Bio",
      "stream now": "jetzt streamen",
      "let me know": "lass mich wissen, was du denkst",
    },
    emojiCulture: "conservative",
    formalityPreference: "formal",
    hashtagStyle: "english",
  },
  pt: {
    name: "Portuguese",
    nativeName: "Português",
    culturalNotes: [
      "Brazilian vs European Portuguese differ",
      "Você (BR) vs Tu (PT)",
      "Brazilian audiences are very warm and expressive",
    ],
    commonPhrases: {
      "new music": "música nova",
      "out now": "já disponível",
      "check it out": "confira agora",
      "link in bio": "link na bio",
      "stream now": "ouça agora",
      "let me know": "me conta o que achou",
    },
    emojiCulture: "expressive",
    formalityPreference: "informal",
    hashtagStyle: "mixed",
  },
  it: {
    name: "Italian",
    nativeName: "Italiano",
    culturalNotes: [
      "Expressive and emotional language",
      "Double consonants matter",
      "Italian audiences appreciate passion",
    ],
    commonPhrases: {
      "new music": "nuova musica",
      "out now": "fuori ora",
      "check it out": "ascoltalo subito",
      "link in bio": "link in bio",
      "stream now": "ascolta ora",
      "let me know": "fatemi sapere cosa ne pensate",
    },
    emojiCulture: "expressive",
    formalityPreference: "informal",
    hashtagStyle: "mixed",
  },
  ja: {
    name: "Japanese",
    nativeName: "日本語",
    culturalNotes: [
      "Use appropriate honorifics",
      "Context determines politeness level",
      "Indirect communication preferred",
      "Kaomoji (Japanese emoticons) popular",
    ],
    commonPhrases: {
      "new music": "新曲",
      "out now": "配信中",
      "check it out": "ぜひ聴いてください",
      "link in bio": "プロフィールにリンク",
      "stream now": "今すぐ聴く",
      "let me know": "感想を聞かせてください",
    },
    emojiCulture: "expressive",
    formalityPreference: "formal",
    hashtagStyle: "native",
  },
  ko: {
    name: "Korean",
    nativeName: "한국어",
    culturalNotes: [
      "Formal speech levels for wider audience",
      "K-pop influence on music terminology",
      "Aegyo (cuteness) appreciated in casual content",
    ],
    commonPhrases: {
      "new music": "새 음악",
      "out now": "지금 공개",
      "check it out": "들어보세요",
      "link in bio": "프로필 링크",
      "stream now": "지금 듣기",
      "let me know": "의견을 알려주세요",
    },
    emojiCulture: "expressive",
    formalityPreference: "formal",
    hashtagStyle: "mixed",
  },
  zh: {
    name: "Chinese",
    nativeName: "中文",
    culturalNotes: [
      "Simplified for mainland, Traditional for Taiwan/HK",
      "Cultural sensitivity important",
      "Red color is lucky, white can be mourning",
    ],
    commonPhrases: {
      "new music": "新歌",
      "out now": "现已发布",
      "check it out": "快来听听",
      "link in bio": "链接在简介",
      "stream now": "立即收听",
      "let me know": "告诉我你的想法",
    },
    emojiCulture: "moderate",
    formalityPreference: "mixed",
    hashtagStyle: "native",
  },
  ar: {
    name: "Arabic",
    nativeName: "العربية",
    culturalNotes: [
      "Right-to-left text direction",
      "Formal Modern Standard Arabic for wider reach",
      "Regional dialects vary significantly",
    ],
    commonPhrases: {
      "new music": "موسيقى جديدة",
      "out now": "متاح الآن",
      "check it out": "استمع الآن",
      "link in bio": "الرابط في البايو",
      "stream now": "استمع الآن",
      "let me know": "أخبرني برأيك",
    },
    emojiCulture: "moderate",
    formalityPreference: "formal",
    hashtagStyle: "mixed",
  },
  hi: {
    name: "Hindi",
    nativeName: "हिन्दी",
    culturalNotes: [
      "Hinglish (Hindi-English mix) widely used",
      "Bollywood influence on music culture",
      "Respectful language for elders/superiors",
    ],
    commonPhrases: {
      "new music": "नया गाना",
      "out now": "अभी सुनें",
      "check it out": "सुनो अभी",
      "link in bio": "बायो में लिंक",
      "stream now": "अभी सुनें",
      "let me know": "बताओ कैसा लगा",
    },
    emojiCulture: "expressive",
    formalityPreference: "informal",
    hashtagStyle: "mixed",
  },
};

const MUSIC_TERMS: Record<string, Record<string, string>> = {
  beat: {
    es: "ritmo",
    fr: "rythme",
    de: "Beat",
    pt: "batida",
    it: "ritmo",
    ja: "ビート",
    ko: "비트",
    zh: "节拍",
    ar: "إيقاع",
    hi: "बीट",
  },
  track: {
    es: "canción",
    fr: "morceau",
    de: "Track",
    pt: "faixa",
    it: "traccia",
    ja: "曲",
    ko: "트랙",
    zh: "曲目",
    ar: "أغنية",
    hi: "ट्रैक",
  },
  album: {
    es: "álbum",
    fr: "album",
    de: "Album",
    pt: "álbum",
    it: "album",
    ja: "アルバム",
    ko: "앨범",
    zh: "专辑",
    ar: "ألبوم",
    hi: "एल्बम",
  },
  lyrics: {
    es: "letras",
    fr: "paroles",
    de: "Texte",
    pt: "letras",
    it: "testi",
    ja: "歌詞",
    ko: "가사",
    zh: "歌词",
    ar: "كلمات",
    hi: "गाने के बोल",
  },
  vibe: {
    es: "vibra",
    fr: "ambiance",
    de: "Stimmung",
    pt: "vibe",
    it: "atmosfera",
    ja: "雰囲気",
    ko: "분위기",
    zh: "氛围",
    ar: "أجواء",
    hi: "वाइब",
  },
  drop: {
    es: "lanzamiento",
    fr: "sortie",
    de: "Release",
    pt: "lançamento",
    it: "uscita",
    ja: "リリース",
    ko: "발매",
    zh: "发行",
    ar: "إصدار",
    hi: "रिलीज",
  },
  playlist: {
    es: "playlist",
    fr: "playlist",
    de: "Playlist",
    pt: "playlist",
    it: "playlist",
    ja: "プレイリスト",
    ko: "플레이리스트",
    zh: "播放列表",
    ar: "قائمة تشغيل",
    hi: "प्लेलिस्ट",
  },
  stream: {
    es: "escuchar",
    fr: "écouter",
    de: "streamen",
    pt: "ouvir",
    it: "ascoltare",
    ja: "ストリーミング",
    ko: "스트리밍",
    zh: "收听",
    ar: "بث",
    hi: "स्ट्रीम",
  },
};

class AITranslationService {
  async translateContent(
    request: TranslationRequest,
  ): Promise<TranslatedContent[]> {
    const results: TranslatedContent[] = [];

    for (const targetLang of request.targetLanguages) {
      try {
        const translated = await this.translateToLanguage(
          request.content,
          request.headline,
          request.hashtags || [],
          request.sourceLanguage || "en",
          targetLang,
          request.preserveTone ?? true,
          request.adaptForPlatform,
        );
        results.push(translated);
      } catch (error) {
        const msg = (error as Error)?.message ?? String(error);
        logger.warn(
          `[Translation] Failed to translate to ${targetLang}: ${msg}`,
        );
        throw error;
      }
    }

    return results;
  }

  private async translateToLanguage(
    content: string,
    headline: string | undefined,
    hashtags: string[],
    _sourceLang: string,
    targetLang: string,
    preserveTone: boolean,
    _platform?: string,
  ): Promise<TranslatedContent> {
    const langData = LANGUAGE_DATA[targetLang];
    if (!langData) {
      throw new Error(
        `[Translation] Language '${targetLang}' is not supported by the translation engine`,
      );
    }

    let translatedContent = this.applyPhraseTranslations(content, targetLang);
    translatedContent = this.applyMusicTermTranslations(
      translatedContent,
      targetLang,
    );

    if (preserveTone) {
      translatedContent = this.adaptTone(translatedContent, langData);
    }

    let translatedHeadline: string | undefined;
    if (headline) {
      translatedHeadline = this.applyPhraseTranslations(headline, targetLang);
      translatedHeadline = this.applyMusicTermTranslations(
        translatedHeadline,
        targetLang,
      );
    }

    const translatedHashtags = this.translateHashtags(
      hashtags,
      targetLang,
      langData.hashtagStyle,
    );

    translatedContent = this.addCulturalAdaptations(
      translatedContent,
      langData,
    );

    return {
      language: langData.name,
      languageCode: targetLang,
      content: translatedContent,
      headline: translatedHeadline,
      hashtags: translatedHashtags,
      culturalNotes: langData.culturalNotes,
      confidence: this.calculateConfidence(
        content,
        translatedContent,
        targetLang,
      ),
    };
  }

  private applyPhraseTranslations(text: string, targetLang: string): string {
    const langData = LANGUAGE_DATA[targetLang];
    if (!langData) return text;

    let result = text;
    for (const [english, translated] of Object.entries(
      langData.commonPhrases,
    )) {
      const regex = new RegExp(english, "gi");
      result = result.replace(regex, translated);
    }

    return result;
  }

  private applyMusicTermTranslations(text: string, targetLang: string): string {
    let result = text;

    for (const [english, translations] of Object.entries(MUSIC_TERMS)) {
      if (translations[targetLang]) {
        const regex = new RegExp(`\\b${english}\\b`, "gi");
        result = result.replace(regex, translations[targetLang]);
      }
    }

    return result;
  }

  private adaptTone(
    content: string,
    langData: (typeof LANGUAGE_DATA)[string],
  ): string {
    let adapted = content;

    if (langData.formalityPreference === "informal") {
      adapted = adapted.replace(/\bplease\b/gi, "");
      adapted = adapted.replace(/\bkindly\b/gi, "");
    }

    if (langData.emojiCulture === "expressive") {
      if (!adapted.match(new RegExp("[\\u{1F300}-\\u{1F9FF}]", "gu"))) {
        adapted = adapted + " 🎵";
      }
    } else if (langData.emojiCulture === "conservative") {
      const emojiRegex = new RegExp("[\\u{1F300}-\\u{1F9FF}]", "gu");
      const emojis = adapted.match(emojiRegex) || [];
      if (emojis.length > 2) {
        let count = 0;
        adapted = adapted.replace(emojiRegex, (match) => {
          count++;
          return count <= 2 ? match : "";
        });
      }
    }

    return adapted.trim();
  }

  private translateHashtags(
    hashtags: string[],
    targetLang: string,
    style: "english" | "native" | "mixed",
  ): string[] {
    if (style === "english") {
      return hashtags;
    }

    const langData = LANGUAGE_DATA[targetLang];
    if (!langData) return hashtags;

    const translated: string[] = [];

    for (const hashtag of hashtags) {
      const cleanTag = hashtag.replace("#", "").toLowerCase();

      if (style === "native") {
        const nativeTag = this.translateHashtagContent(cleanTag, targetLang);
        translated.push(`#${nativeTag}`);
      } else {
        translated.push(hashtag);
        const nativeTag = this.translateHashtagContent(cleanTag, targetLang);
        if (nativeTag !== cleanTag) {
          translated.push(`#${nativeTag}`);
        }
      }
    }

    return [...new Set(translated)].slice(0, hashtags.length + 3);
  }

  private translateHashtagContent(tag: string, targetLang: string): string {
    const langData = LANGUAGE_DATA[targetLang];
    if (!langData) return tag;

    for (const [english, translated] of Object.entries(
      langData.commonPhrases,
    )) {
      const englishNormalized = english.replace(/\s+/g, "").toLowerCase();
      if (tag.toLowerCase() === englishNormalized) {
        return translated.replace(/\s+/g, "");
      }
    }

    for (const [english, translations] of Object.entries(MUSIC_TERMS)) {
      if (
        tag.toLowerCase() === english.toLowerCase() &&
        translations[targetLang]
      ) {
        return translations[targetLang].replace(/\s+/g, "");
      }
    }

    return tag;
  }

  private addCulturalAdaptations(
    content: string,
    langData: (typeof LANGUAGE_DATA)[string],
  ): string {
    let adapted = content;

    if (langData.nativeName === "Español") {
      if (adapted.includes("!") && !adapted.includes("¡")) {
        adapted = adapted.replace(
          /([A-Za-z])([^!]*!)/g,
          (match, first, rest) => {
            if (rest.length < 50) {
              return `¡${first}${rest}`;
            }
            return match;
          },
        );
      }
      if (adapted.includes("?") && !adapted.includes("¿")) {
        adapted = adapted.replace(
          /([A-Za-z])([^?]*\?)/g,
          (match, first, rest) => {
            if (rest.length < 50) {
              return `¿${first}${rest}`;
            }
            return match;
          },
        );
      }
    }

    return adapted;
  }

  private calculateConfidence(
    original: string,
    translated: string,
    targetLang: string,
  ): number {
    let confidence = 70;

    const langData = LANGUAGE_DATA[targetLang];
    if (langData) {
      confidence += 10;

      const phrasesApplied = Object.keys(langData.commonPhrases).filter(
        (phrase) => original.toLowerCase().includes(phrase.toLowerCase()),
      ).length;
      confidence += Math.min(phrasesApplied * 3, 10);
    }

    if (translated !== original) {
      confidence += 5;
    }

    const termsTranslated = Object.keys(MUSIC_TERMS).filter((term) =>
      original.toLowerCase().includes(term.toLowerCase()),
    ).length;
    confidence += Math.min(termsTranslated * 2, 5);

    return Math.min(confidence, 95);
  }

  getSupportedLanguages(): {
    code: string;
    name: string;
    nativeName: string;
  }[] {
    return Object.entries(LANGUAGE_DATA).map(([code, data]) => ({
      code,
      name: data.name,
      nativeName: data.nativeName,
    }));
  }

  async translateForMultiplePlatforms(
    content: string,
    headline: string,
    platforms: string[],
    targetLanguages: string[],
  ): Promise<Map<string, Map<string, TranslatedContent>>> {
    const results = new Map<string, Map<string, TranslatedContent>>();

    for (const platform of platforms) {
      const platformTranslations = new Map<string, TranslatedContent>();

      for (const lang of targetLanguages) {
        const translated = await this.translateToLanguage(
          content,
          headline,
          [],
          "en",
          lang,
          true,
          platform,
        );
        platformTranslations.set(lang, translated);
      }

      results.set(platform, platformTranslations);
    }

    return results;
  }
}

export const aiTranslationService = new AITranslationService();
