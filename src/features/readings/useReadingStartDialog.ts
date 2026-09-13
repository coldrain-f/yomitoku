import { useCallback } from "react";
import { formatTime } from "../../lib/reading";
import type {
  ErrorMessage,
  TranslationFunction,
} from "../../lib/i18n";
import type {
  DifficultyLevel,
  LengthType,
  ReadingItem,
  Topic,
} from "../../types";
import type { DialogConfig } from "../../types";

interface UseReadingStartDialogOptions {
  authenticated: boolean;
  closeDialog: () => void;
  errorMessage: ErrorMessage;
  lengthLabel: (length: LengthType) => string;
  levelLabel: (level: DifficultyLevel) => string;
  navigate: (path: string) => void;
  onUnauthenticatedStart: (item: ReadingItem) => void;
  openDialog: (value: DialogConfig) => void;
  showToast: (message: string) => void;
  startAttempt: (item: ReadingItem) => Promise<void>;
  t: TranslationFunction;
  topicLabel: (topic: Topic) => string;
}

export function useReadingStartDialog({
  authenticated,
  closeDialog,
  errorMessage,
  lengthLabel,
  levelLabel,
  navigate,
  onUnauthenticatedStart,
  openDialog,
  showToast,
  startAttempt,
  t,
  topicLabel,
}: UseReadingStartDialogOptions) {
  const openStartDialog = useCallback((item: ReadingItem) => {
    const hasScore = item.myScore !== null;
    const hasPreviousSubmission = hasScore || item.myLatestStatus !== null;
    const previousResult = hasScore
      ? t("start.previousScore", { score: item.myScore ?? "" })
      : item.myLatestStatus === "wrong"
        ? t("start.previousWrong")
        : item.myLatestStatus === "correct"
          ? t("start.previousCorrect")
          : null;
    openDialog({
      kicker: t("start.kicker"),
      title:
        !hasScore && item.myLatestStatus === "wrong"
          ? t("start.retryWrong")
          : hasPreviousSubmission
            ? t("start.retry")
            : t("start.begin"),
      context: item.title,
      contextMeta: [
        levelLabel(item.officialLevel),
        lengthLabel(item.lengthType),
        topicLabel(item.topic),
      ],
      description: hasPreviousSubmission
        ? t("start.retryDescription", { previous: previousResult ?? "" })
        : t("start.description", { time: formatTime(item.recommendedSeconds) }),
      confirmLabel: hasPreviousSubmission ? t("start.retryButton") : t("start.button"),
      onConfirm: () => {
        closeDialog();
        void (async () => {
          try {
            await startAttempt(item);
            navigate(`/readings/${item.id}`);
          } catch (error) {
            showToast(errorMessage(error, "start.openFailed"));
          }
        })();
      },
    });
  }, [
    closeDialog,
    errorMessage,
    lengthLabel,
    levelLabel,
    navigate,
    openDialog,
    showToast,
    startAttempt,
    t,
    topicLabel,
  ]);

  const start = useCallback((item: ReadingItem) => {
    if (authenticated) {
      openStartDialog(item);
      return;
    }
    onUnauthenticatedStart(item);
  }, [authenticated, onUnauthenticatedStart, openStartDialog]);

  return { openStartDialog, start };
}
