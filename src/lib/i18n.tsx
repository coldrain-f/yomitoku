import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  languageNames,
  lengthNames,
  levelNames,
  messages,
  topicNames,
  type UiLocale,
} from "./i18n.messages";
import type {
  DifficultyLevel,
  LengthType,
  ReadingItem,
  ReadingLanguage,
  Topic,
} from "../types";

export type { UiLocale } from "./i18n.messages";

type TranslationVariables = Record<string, string | number>;

const localeStorageKey = "yomitoku.ui-locale";

function translate(
  locale: UiLocale,
  key: string,
  variables: TranslationVariables = {},
) {
  const template = messages[locale][key] ?? messages.ko[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(variables[name] ?? ""));
}

interface I18nContextValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (key: string, variables?: TranslationVariables) => string;
  languageLabel: (language: ReadingLanguage) => string;
  levelLabel: (level: DifficultyLevel) => string;
  lengthLabel: (length: LengthType) => string;
  topicLabel: (topic: Topic) => string;
  perceivedLabel: (item: Pick<ReadingItem, "perceivedVotes" | "perceivedLevel">) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): UiLocale {
  const stored = window.localStorage.getItem(localeStorageKey);
  if (stored === "ko" || stored === "ja") return stored;
  return window.navigator.language.toLowerCase().startsWith("ja") ? "ja" : "ko";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<UiLocale>(initialLocale);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, variables?: TranslationVariables) => translate(locale, key, variables),
    [locale],
  );
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      languageLabel: (language) => languageNames[locale][language],
      levelLabel: (level) => levelNames[locale][level],
      lengthLabel: (length) => lengthNames[locale][length],
      topicLabel: (topic) => topicNames[locale][topic],
      perceivedLabel: (item) =>
        item.perceivedVotes >= 10
          ? t("perceived.withVotes", { level: levelNames[locale][item.perceivedLevel] })
          : t("perceived.pending"),
    }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within LocaleProvider.");
  return value;
}
