import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import sr from "./locales/sr.json";

/** Languages exposed in the UI switcher. */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sr", label: "Srpski" },
] as const;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sr: { translation: sr },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
