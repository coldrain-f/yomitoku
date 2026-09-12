import { useCallback, useRef, useState } from "react";
import { api, type SubmittedAttempt } from "../../lib/api";
import type { ReadingAttempt, ReadingItem, ReadingResult } from "../../types";

function resultFromSubmission(
  item: ReadingItem,
  choices: ReadingAttempt["choices"],
  submitted: SubmittedAttempt,
  itemId = item.id,
): ReadingResult {
  return {
    itemId,
    item,
    choices,
    selectedChoiceId: submitted.selectedChoiceId,
    correctChoiceId: submitted.correctChoiceId,
    isCorrect: submitted.isCorrect,
    elapsedSeconds: submitted.elapsedSeconds,
    explanation: submitted.explanation,
    selectedChoiceWrongExplanation: submitted.selectedChoiceWrongExplanation,
    itemAccuracy: submitted.itemAccuracy,
    challengerCount: submitted.challengerCount,
    questionResults: submitted.questionResults,
  };
}

export function useReadingSubmission() {
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const resetSubmission = useCallback(() => {
    submittingRef.current = false;
    setResult(null);
    setIsSubmitting(false);
  }, []);

  const restoreSubmission = useCallback(
    (
      item: ReadingItem,
      itemId: string,
      submitted: SubmittedAttempt | null,
    ) => {
      submittingRef.current = false;
      setIsSubmitting(false);
      if (!submitted) {
        setResult(null);
        return;
      }
      setResult(resultFromSubmission(item, item.choices, submitted, itemId));
    },
    [],
  );

  const submitReadingAttempt = useCallback(
    async (attempt: ReadingAttempt, item: ReadingItem) => {
      if (submittingRef.current) return null;
      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        const submitted = await api.submitAttempt(
          attempt.attemptId,
          attempt.answers,
          attempt.elapsedSeconds,
        );
        setResult(resultFromSubmission(item, attempt.choices, submitted));
        return submitted;
      } catch (error) {
        submittingRef.current = false;
        setIsSubmitting(false);
        throw error;
      }
    },
    [],
  );

  return {
    isSubmitting,
    resetSubmission,
    result,
    restoreSubmission,
    submitReadingAttempt,
    submittingRef,
  };
}
