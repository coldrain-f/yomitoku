import { useCallback, useState } from "react";
import { api, type ReadingTranslation } from "../lib/api";
import type {
  ErrorMessage,
  TranslationFunction,
} from "../lib/i18n";
import type { DialogConfig } from "../types";

interface UseTranslationDialogOptions {
  errorMessage: ErrorMessage;
  openDialog: (value: DialogConfig) => void;
  t: TranslationFunction;
}

export function useTranslationDialog({
  errorMessage,
  openDialog,
  t,
}: UseTranslationDialogOptions) {
  const [translation, setTranslation] = useState<ReadingTranslation | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");

  const openTranslation = useCallback((itemId: string) => {
    setTranslation(null);
    setTranslationError("");
    setTranslationLoading(true);
    openDialog({
      type: "translation",
      kicker: t("translation.kicker"),
      title: t("translation.title"),
      description: t("translation.description"),
    });
    void api
      .translateReading(itemId)
      .then(setTranslation)
      .catch((error: unknown) =>
        setTranslationError(errorMessage(error, "translation.failed")),
      )
      .finally(() => setTranslationLoading(false));
  }, [errorMessage, openDialog, t]);

  return {
    openTranslation,
    translation,
    translationError,
    translationLoading,
  };
}
