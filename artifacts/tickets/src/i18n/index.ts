import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "./locales/es.json";
import en from "./locales/en.json";

export const LANGUAGE_KEY = "tapee_tickets_lang";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: localStorage.getItem(LANGUAGE_KEY) ?? "es",
    fallbackLng: "es",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
