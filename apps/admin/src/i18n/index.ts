// The admin's own words. French only for now, and the fallback for good; the labels of content
// fields come from the shared schema, already in French.
import { DEFAULT_LOCALE } from "@wayfarers-rest/shared";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
