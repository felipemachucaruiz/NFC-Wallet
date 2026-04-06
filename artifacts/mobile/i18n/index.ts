import i18n from "i18next";
import { initReactI18next } from "react-i18next";
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

async function getDeviceLanguage(): Promise<string> {
  // Dynamic import prevents a missing/incompatible expo-localization native
  // module (e.g. OTA update on an older binary) from crashing the JS runtime
  // at module-load time. Defaults to Spanish on any error.
  try {
    const { getLocales } = await import("expo-localization");
    return getLocales()[0]?.languageCode === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

export async function initI18n(): Promise<void> {
  const stored = await getStoredLanguage();
  const lng = stored ?? (await getDeviceLanguage());

  await i18n.use(initReactI18next).init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng,
    fallbackLng: "es",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
