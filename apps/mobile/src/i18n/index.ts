import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hi } from './hi';

export type Language = 'en' | 'hi';
export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
];

const KEY = 'hoc-language';
let current: Language = 'en';

/**
 * Translates an English UI text. English text is the key, so anything without a translation
 * simply stays in English instead of breaking. `{name}` placeholders are filled from `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const base = current === 'hi' ? (hi[text] ?? text) : text;
  return vars ? base.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : base;
}

export const getLanguage = () => current;

/** The phone's language the first time, then whatever the partner chose. */
async function initialLanguage(): Promise<Language> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'en' || saved === 'hi') return saved;
  } catch {
    // storage unavailable: fall through to the device language
  }
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
  return locale.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => Promise<void>;
}
const LanguageContext = createContext<LanguageContextValue>({ language: 'en', setLanguage: async () => {} });

export const useLanguage = () => useContext(LanguageContext);

/** Re-renders everything under it when the language changes (`t` reads a plain variable, so a new key remounts the tree). */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language | null>(null);

  useEffect(() => {
    void initialLanguage().then((l) => {
      current = l;
      setLang(l);
    });
  }, []);

  const setLanguage = useCallback(async (l: Language) => {
    current = l;
    setLang(l);
    try {
      await AsyncStorage.setItem(KEY, l);
    } catch {
      // not saved: it still applies for this session
    }
  }, []);

  const value = useMemo(() => ({ language: language ?? 'en', setLanguage }), [language, setLanguage]);
  if (!language) return null;
  return createElement(LanguageContext.Provider, { value }, createElement(Fragment, { key: language }, children));
}
