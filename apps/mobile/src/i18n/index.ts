// The app's own words. French is the default and the fallback; the content written in the admin
// carries its translations itself (see LocalizedText in @wayfarers-rest/shared).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@wayfarers-rest/shared";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

const deviceLanguage = getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
const language: Locale = (LOCALES as readonly string[]).includes(deviceLanguage)
  ? (deviceLanguage as Locale)
  : DEFAULT_LOCALE;

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: language,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
