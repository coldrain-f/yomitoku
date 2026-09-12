import { useEffect, useRef, useState } from "react";
import { api, type SubmittedAttempt } from "../../lib/api";
import type {
  AttemptQuestionAnswer,
  ReadingAttempt,
  ReadingItem,
  ReadingResult,
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
  userId: string | null;
  pathname: string;
  setItems: StateSetter<ReadingItem[]>;
  loadPassageHighlights: (itemId: string) => Promise<void>;
  onRestoredSubmission: (item: ReadingItem, submission: SubmittedAttempt) => void;
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
  userId,
  pathname,
  setItems,
  loadPassageHighlights,
  onRestoredSubmission,
}: ReadingAttemptOptions) {
  const [attempt, setAttempt] = useState<ReadingAttempt | null>(null);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const restoredAttemptKeyRef = useRef<string | null>(null);

  const clearStoredSession = () => {
    if (userId) removeReadingSession(userId);
  };

  const resetSession = () => {
    restoredAttemptKeyRef.current = null;
    submittingRef.current = false;
    setAttempt(null);
    setResult(null);
    setIsSubmitting(false);
  };

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
    setResult(null);
    submittingRef.current = false;
    setIsSubmitting(false);
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
    if (!authenticated || !userId || authLoading) return;
    const match = pathname.match(/^\/(?:readings|results)\/([^/]+)$/);
    if (!match || attempt?.itemId === match[1]) return;
    const storedSession = readStoredReadingSession(userId);
    if (!storedSession || storedSession.itemId !== match[1]) return;
    const key = `${userId}:${storedSession.attemptId}:${pathname}`;
    if (restoredAttemptKeyRef.current === key) return;
    restoredAttemptKeyRef.current = key;
    let active = true;

    void api
      .attempt(storedSession.attemptId)
      .then((restored) => {
        if (!active || restored.itemId !== storedSession.itemId) return;
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
        submittingRef.current = false;
        setIsSubmitting(false);
        const submitted = restored.result;
        if (!submitted) {
          setResult(null);
          return;
        }
        setResult({
          itemId: restored.itemId,
          item: restored.item,
          choices: restored.item.choices,
          selectedChoiceId: submitted.selectedChoiceId,
          correctChoiceId: submitted.correctChoiceId,
          isCorrect: submitted.isCorrect,
          elapsedSeconds: submitted.elapsedSeconds,
          explanation: submitted.explanation,
          selectedChoiceWrongExplanation: submitted.selectedChoiceWrongExplanation,
          itemAccuracy: submitted.itemAccuracy,
          challengerCount: submitted.challengerCount,
          questionResults: submitted.questionResults,
        });
        onRestoredSubmission(restored.item, submitted);
      })
      .catch(() => {
        removeReadingSession(userId);
      });
    return () => {
      active = false;
    };
  }, [
    attempt?.itemId,
    authLoading,
    authenticated,
    loadPassageHighlights,
    onRestoredSubmission,
    pathname,
    setItems,
    userId,
  ]);

  return {
    attempt,
    clearStoredSession,
    isSubmitting,
    resetSession,
    result,
    setAttempt,
    setIsSubmitting,
    setResult,
    startAttempt,
    submittingRef,
  };
}
