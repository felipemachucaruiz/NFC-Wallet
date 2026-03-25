import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import es from "./es.json";
import en from "./en.json";

const LANG_KEY = "@lang";

export const SUPPORTED_LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
];

export async function getStoredLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

export async function setStoredLanguage(lang: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LANG_KEY, lang);
  } catch {}
}

export async function initI18n(): Promise<void> {
  const stored = await getStoredLanguage();
  const deviceLocale = Localization.getLocales()[0]?.languageCode ?? "es";
  const lng = stored ?? (deviceLocale === "en" ? "en" : "es");

  await i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng,
    fallbackLng: "es",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
