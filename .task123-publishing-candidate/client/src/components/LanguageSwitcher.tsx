import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  // Normalize language code to base language (e.g., en-US -> en)
  const normalizedLanguage = i18n.language.split("-")[0];
  const currentLanguage =
    languages.find((lang) => lang.code === normalizedLanguage) || languages[0];

  return (
    <Select value={normalizedLanguage} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-[180px]">
        <Globe className="w-4 h-4 mr-2" />
        <SelectValue>
          <span className="mr-2">{currentLanguage.flag}</span>
          {currentLanguage.name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {languages.map((language) => (
          <SelectItem key={language.code} value={language.code}>
            <span className="mr-2">{language.flag}</span>
            {language.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
