// The language being written: every text-per-language field of every form shows this one. It is
// kept from one visit to the next, so that English can be filled in item after item.

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@wayfarers-rest/shared";
import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "wr-edit-locale";
const EditLocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: DEFAULT_LOCALE, setLocale: () => {} });

function stored(): Locale {
  const value = localStorage.getItem(STORAGE_KEY);
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : DEFAULT_LOCALE;
}

export function EditLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>(stored);
  const setLocale = (next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setCurrent(next);
  };
  return <EditLocaleContext value={{ locale, setLocale }}>{children}</EditLocaleContext>;
}

// eslint-disable-next-line react/only-export-components
export const useEditLocale = () => useContext(EditLocaleContext);
