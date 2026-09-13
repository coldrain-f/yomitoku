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
  type TranslationKey,
  type UiLocale,
} from "./i18n.messages";
import { ApiError } from "./api";
import type {
  DifficultyLevel,
  LengthType,
  ReadingItem,
  ReadingLanguage,
  Topic,
} from "../types";

export type { UiLocale } from "./i18n.messages";

export type TranslationVariables = Record<string, string | number>;
export type TranslationFunction = (
  key: TranslationKey,
  variables?: TranslationVariables,
) => string;
export type ErrorMessage = (error: unknown, fallbackKey: TranslationKey) => string;

const localeStorageKey = "yomitoku.ui-locale";

const apiErrorMessageKeys: Record<string, TranslationKey> = {
  INVALID_REQUEST: "api.invalidRequest",
  AUTHENTICATION_REQUIRED: "api.authenticationRequired",
  PERMISSION_DENIED: "api.permissionDenied",
  RESOURCE_NOT_FOUND: "api.resourceNotFound",
  CONFLICT: "api.conflict",
  VALIDATION_ERROR: "api.validationError",
  RATE_LIMITED: "api.rateLimited",
  SERVICE_UNAVAILABLE: "api.serviceUnavailable",
  INTERNAL_ERROR: "api.internalError",
  REQUEST_FAILED: "api.requestFailed",
  HTTP_400: "api.invalidRequest",
  HTTP_401: "api.authenticationRequired",
  HTTP_403: "api.permissionDenied",
  HTTP_404: "api.resourceNotFound",
  HTTP_409: "api.conflict",
  HTTP_422: "api.validationError",
  HTTP_429: "api.rateLimited",
  HTTP_500: "api.internalError",
  HTTP_503: "api.serviceUnavailable",
};

function translate(
  locale: UiLocale,
  key: TranslationKey,
  variables: TranslationVariables = {},
) {
  const template = messages[locale][key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(variables[name] ?? ""));
}

interface I18nContextValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: TranslationFunction;
  languageLabel: (language: ReadingLanguage) => string;
  levelLabel: (level: DifficultyLevel) => string;
  lengthLabel: (length: LengthType) => string;
  topicLabel: (topic: Topic) => string;
  perceivedLabel: (item: Pick<ReadingItem, "perceivedVotes" | "perceivedLevel">) => string;
  errorMessage: ErrorMessage;
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
    (key: TranslationKey, variables?: TranslationVariables) => translate(locale, key, variables),
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
      errorMessage: (error, fallbackKey) =>
        error instanceof ApiError
          ? t(apiErrorMessageKeys[error.code] ?? "api.requestFailed")
          : t(fallbackKey),
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
