import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type SubmittedAttempt } from "../../lib/api";
import type {
  AttemptQuestionAnswer,
  ReadingAttempt,
  ReadingItem,
  StateSetter,
} from "../../types";

interface StoredReadingSession {
  attemptId: string;
  itemId: string;
  selectedChoiceId: string | null;
  answers: AttemptQuestionAnswer[];
}

interface ReadingAttemptOptions {
  authenticated: boolean;
  authLoading: boolean;
  isReading: boolean;
  userId: string | null;
  pathname: string;
  setItems: StateSetter<ReadingItem[]>;
  loadPassageHighlights: (itemId: string) => Promise<void>;
  onAttemptStarted: () => void;
  onAttemptRestored: (
    item: ReadingItem,
    itemId: string,
    submission: SubmittedAttempt | null,
  ) => void;
}

const readingSessionStoragePrefix = "yomitoku.reading-session:";

function readingSessionStorageKey(userId: string) {
  return readingSessionStoragePrefix + userId;
}

function readStoredReadingSession(userId: string): StoredReadingSession | null {
  try {
    const stored = window.sessionStorage.getItem(readingSessionStorageKey(userId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const { attemptId, itemId, selectedChoiceId, answers } = parsed as Record<string, unknown>;
    if (typeof attemptId !== "string" || typeof itemId !== "string") return null;
    return {
      attemptId,
      itemId,
      selectedChoiceId: typeof selectedChoiceId === "string" ? selectedChoiceId : null,
      answers: Array.isArray(answers)
        ? answers.flatMap((answer) => {
            if (!answer || typeof answer !== "object" || Array.isArray(answer)) return [];
            const { questionId, selectedChoiceId: choiceId } = answer as Record<string, unknown>;
            return typeof questionId === "string"
              ? [{ questionId, selectedChoiceId: typeof choiceId === "string" ? choiceId : null }]
              : [];
          })
        : [],
    };
  } catch {
    return null;
  }
}

function storeReadingSession(userId: string, session: StoredReadingSession) {
  try {
    window.sessionStorage.setItem(readingSessionStorageKey(userId), JSON.stringify(session));
  } catch {
    // The attempt remains usable when browser storage is unavailable.
  }
}

function removeReadingSession(userId: string) {
  try {
    window.sessionStorage.removeItem(readingSessionStorageKey(userId));
  } catch {
    // No action is needed when browser storage is unavailable.
  }
}

export function useReadingAttempt({
  authenticated,
  authLoading,
  isReading,
  userId,
  pathname,
  setItems,
  loadPassageHighlights,
  onAttemptStarted,
  onAttemptRestored,
}: ReadingAttemptOptions) {
  const [attempt, setAttempt] = useState<ReadingAttempt | null>(null);
  const [unavailableRestorationKey, setUnavailableRestorationKey] = useState<
    string | null
  >(null);
  const routeMatch = pathname.match(/^\/(?:readings|results)\/([^/]+)$/);
  const routeItemId = routeMatch?.[1] ?? null;
  const storedSession = useMemo(
    () =>
      authenticated && userId && !authLoading && routeItemId && attempt?.itemId !== routeItemId
        ? readStoredReadingSession(userId)
        : null,
    [attempt?.itemId, authLoading, authenticated, routeItemId, userId],
  );
  const restorationKey = storedSession && routeItemId
    ? `${userId}:${storedSession.attemptId}:${pathname}`
    : null;
  const isRestoring = Boolean(
    restorationKey && restorationKey !== unavailableRestorationKey,
  );

  const clearStoredSession = useCallback(() => {
    if (userId) removeReadingSession(userId);
  }, [userId]);

  const resetSession = () => {
    setUnavailableRestorationKey(null);
    setAttempt(null);
  };

  const chooseAnswer = useCallback((questionId: string, choiceId: string) => {
    setAttempt((current) =>
      current
        ? {
            ...current,
            selectedChoiceId:
              current.questions[0]?.id === questionId
                ? choiceId
                : current.selectedChoiceId,
            answers: current.answers.map((answer) =>
              answer.questionId === questionId
                ? { ...answer, selectedChoiceId: choiceId }
                : answer,
            ),
            message: "",
          }
        : current,
    );
  }, []);

  const abandonCurrentAttempt = useCallback(() => {
    if (!attempt || attempt.submitted) return;
    void api.abandonAttempt(attempt.attemptId);
    clearStoredSession();
    setAttempt(null);
  }, [attempt, clearStoredSession]);

  const startAttempt = async (item: ReadingItem) => {
    const [detail, started] = await Promise.all([
      api.reading(item.id),
      api.startAttempt(item.id),
    ]);
    void loadPassageHighlights(item.id).catch(() => undefined);
    const readingItem: ReadingItem = {
      ...item,
      title: detail.title,
      language: detail.language,
      officialLevel: detail.officialLevel,
      lengthType: detail.lengthType,
      topic: detail.topic,
      recommendedSeconds: detail.recommendedSeconds,
      passage: detail.passage,
      question: detail.question,
      choices: started.choices,
      questions: started.questions,
    };
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === readingItem.id ? readingItem : currentItem,
      ),
    );
    onAttemptStarted();
    setAttempt({
      attemptId: started.id,
      itemId: item.id,
      startedAt: Date.now(),
      elapsedSeconds: 0,
      selectedChoiceId: null,
      choices: started.choices,
      submitted: false,
      message: "",
      questions: started.questions,
      answers: started.questions.map((question) => ({
        questionId: question.id,
        selectedChoiceId: null,
      })),
    });
  };

  useEffect(() => {
    if (!authenticated || !userId || !attempt) return;
    storeReadingSession(userId, {
      attemptId: attempt.attemptId,
      itemId: attempt.itemId,
      selectedChoiceId: attempt.selectedChoiceId,
      answers: attempt.answers,
    });
  }, [
    attempt?.answers,
    attempt?.attemptId,
    attempt?.itemId,
    attempt?.selectedChoiceId,
    authenticated,
    userId,
  ]);

  useEffect(() => {
    if (authenticated || !userId) return;
    removeReadingSession(userId);
  }, [authenticated, userId]);

  useEffect(() => {
    if (!isReading || !attempt || attempt.submitted) return undefined;
    const tick = () =>
      setAttempt((current) =>
        current
          ? {
              ...current,
              elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000),
            }
          : current,
      );
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [attempt?.startedAt, attempt?.submitted, isReading]);

  useEffect(() => {
    if (!storedSession || !routeItemId || !restorationKey) return undefined;
    let active = true;

    void api
      .attempt(storedSession.attemptId)
      .then((restored) => {
        if (!active) return;
        if (restored.itemId !== storedSession.itemId) {
          removeReadingSession(userId!);
          setUnavailableRestorationKey(restorationKey);
          return;
        }
        void loadPassageHighlights(restored.itemId).catch(() => undefined);
        const storedAnswers = new Map(
          storedSession.answers.map((answer) => [answer.questionId, answer.selectedChoiceId]),
        );
        const answers = restored.item.questions.map((question, index) => {
          const validChoiceIds = new Set(question.choices.map((choice) => choice.id));
          const restoredChoice = restored.answers.find(
            (answer) => answer.questionId === question.id,
          )?.selectedChoiceId;
          const storedChoice = storedAnswers.get(question.id) ?? (
            index === 0 ? storedSession.selectedChoiceId : null
          );
          const selectedChoiceId = [restoredChoice, storedChoice].find(
            (choiceId): choiceId is string => Boolean(choiceId && validChoiceIds.has(choiceId)),
          ) ?? null;
          return { questionId: question.id, selectedChoiceId };
        });
        const selectedChoiceId = answers[0]?.selectedChoiceId ?? null;
        const nextAttempt: ReadingAttempt = {
          attemptId: restored.id,
          itemId: restored.itemId,
          startedAt: new Date(restored.startedAt).getTime(),
          elapsedSeconds: restored.elapsedSeconds,
          selectedChoiceId,
          choices: restored.item.choices,
          submitted: restored.submitted,
          message: "",
          questions: restored.item.questions,
          answers,
        };
        setItems((current) =>
          current.some((item) => item.id === restored.item.id)
            ? current.map((item) =>
                item.id === restored.item.id ? restored.item : item,
              )
            : [restored.item, ...current],
        );
        setAttempt(nextAttempt);
        setUnavailableRestorationKey(null);
        const submitted = restored.result;
        onAttemptRestored(restored.item, restored.itemId, submitted);
      })
      .catch(() => {
        if (!active) return;
        removeReadingSession(userId!);
        setUnavailableRestorationKey(restorationKey);
      });
    return () => {
      active = false;
    };
  }, [
    loadPassageHighlights,
    onAttemptRestored,
    restorationKey,
    setItems,
    routeItemId,
    storedSession,
    userId,
  ]);

  return {
    abandonCurrentAttempt,
    attempt,
    chooseAnswer,
    clearStoredSession,
    isRestoring,
    resetSession,
    setAttempt,
    startAttempt,
  };
}
