import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";

const SUPPORTED_LOCALES = ["es", "fr", "de", "ja"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

const loadedLocales = new Set<string>(["en"]);

export async function loadLocale(lang: string): Promise<void> {
  const base = lang.split("-")[0].toLowerCase() as SupportedLocale;
  if (loadedLocales.has(base) || !SUPPORTED_LOCALES.includes(base)) return;
  loadedLocales.add(base);
  try {
    const mod = await import(`./locales/${base}.json`);
    i18n.addResourceBundle(base, "translation", mod.default ?? mod, true, true);
  } catch {
    loadedLocales.delete(base);
  }
}

i18n.on("languageChanged", (lang: string) => {
  loadLocale(lang);
});

const detectedLang = i18n.language || navigator?.language || "en";
if (detectedLang !== "en") {
  loadLocale(detectedLang);
}

export default i18n;
