import { Navigate, useParams } from "react-router-dom";
import { useI18n } from "../../lib/i18n";
import type {
  PassageHighlight,
  ReadingAttempt,
  ReadingItem,
  ReadingResult,
} from "../../types";
import { ReadingScreen, ResultScreen } from "./ReadingScreens";

interface ReadingRouteProps {
  items: ReadingItem[];
  attempt: ReadingAttempt | null;
  result: ReadingResult | null;
  onChoose: (questionId: string, choiceId: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  onAbandon: () => void;
  onReport: () => void;
  onTranslate: () => void;
  onResult: () => void;
  highlights: PassageHighlight[];
  onCreateHighlight: (
    startOffset: number,
    endOffset: number,
    selectedText: string,
  ) => Promise<PassageHighlight>;
  onDeleteHighlight: (highlightId: string) => Promise<void>;
  isRestoring: boolean;
}

function RouteRestoreLoading() {
  const { t } = useI18n();
  return <p className="route-restore-loading" role="status">{t("common.loading")}</p>;
}

export function ReadingRoute({
  items,
  attempt,
  result,
  onChoose,
  onSubmit,
  isSubmitting,
  onAbandon,
  onReport,
  onTranslate,
  onResult,
  highlights,
  onCreateHighlight,
  onDeleteHighlight,
  isRestoring,
}: ReadingRouteProps) {
  const { itemId } = useParams();
  const item =
    items.find((entry) => entry.id === itemId) ??
    (result && result.itemId === itemId ? result.item : undefined);
  if (!item || attempt?.itemId !== item.id) {
    return isRestoring ? <RouteRestoreLoading /> : <Navigate to="/" replace />;
  }

  return (
    <ReadingScreen
      item={item}
      attempt={attempt}
      result={result}
      onChoose={onChoose}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      onAbandon={onAbandon}
      onReport={onReport}
      onTranslate={onTranslate}
      onResult={onResult}
      highlights={highlights}
      onCreateHighlight={onCreateHighlight}
      onDeleteHighlight={onDeleteHighlight}
    />
  );
}

interface ResultRouteProps {
  result: ReadingResult | null;
  onFeedback: () => void;
  onReview: () => void;
  onContinue: () => void;
  onHome: () => void;
  isRestoring: boolean;
  isContinuing: boolean;
  isFilterComplete: boolean;
}

export function ResultRoute({
  result,
  onFeedback,
  onReview,
  onContinue,
  onHome,
  isRestoring,
  isContinuing,
  isFilterComplete,
}: ResultRouteProps) {
  const { itemId } = useParams();
  if (!result || result.itemId !== itemId) {
    return isRestoring ? <RouteRestoreLoading /> : <Navigate to="/" replace />;
  }

  return (
    <ResultScreen
      result={result}
      onFeedback={onFeedback}
      onReview={onReview}
      onContinue={onContinue}
      onHome={onHome}
      isContinuing={isContinuing}
      isFilterComplete={isFilterComplete}
    />
  );
}
