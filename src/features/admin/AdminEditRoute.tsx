import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useI18n } from "../../lib/i18n";
import { readingTopics } from "../../lib/readingPolicy";
import type { ReadingItem, ReadingLanguage, StateSetter } from "../../types";
import { AdminEdit } from "./AdminScreens";

interface AdminEditRouteProps {
  items: ReadingItem[];
  draft: ReadingItem | null;
  setDraft: StateSetter<ReadingItem | null>;
  onSave: () => void;
  onHold: (item: ReadingItem) => void;
  onPublish: (item: ReadingItem) => void;
  onDelete: (item: ReadingItem) => void;
  onBack: () => void;
  isSaving: boolean;
  onConfirmQuestionTruncation: (
    removedQuestionCount: number,
    onConfirm: () => void,
  ) => void;
  onSuggestTitleRequest: (passage: string, language: ReadingLanguage) => Promise<string>;
  onSuggestTopicRequest: (
    passage: string,
    language: ReadingLanguage,
  ) => Promise<ReadingItem["topic"]>;
  onSuggestExplanationRequest: (
    passage: string,
    question: string,
    choices: ReadingItem["choices"],
    language: ReadingLanguage,
  ) => Promise<string>;
}

export function AdminEditRoute({
  items,
  draft,
  setDraft,
  onSave,
  onHold,
  onPublish,
  onDelete,
  onBack,
  isSaving,
  onConfirmQuestionTruncation,
  onSuggestTitleRequest,
  onSuggestTopicRequest,
  onSuggestExplanationRequest,
}: AdminEditRouteProps) {
  const { t, errorMessage } = useI18n();
  const { itemId } = useParams();
  const item = items.find((entry) => entry.id === itemId);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [titleSuggestionError, setTitleSuggestionError] = useState("");
  const [isSuggestingTopic, setIsSuggestingTopic] = useState(false);
  const [topicSuggestionError, setTopicSuggestionError] = useState("");
  const [suggestingExplanationIndex, setSuggestingExplanationIndex] = useState<number | null>(null);
  const [explanationSuggestionErrors, setExplanationSuggestionErrors] = useState<
    Record<number, string>
  >({});
  const suggestionRequestRef = useRef(0);

  useEffect(() => {
    if (item && (!draft || draft.id !== item.id)) setDraft(structuredClone(item));
  }, [draft?.id, item, setDraft]);

  useEffect(() => {
    suggestionRequestRef.current += 1;
    setIsSuggestingTitle(false);
    setTitleSuggestionError("");
    setIsSuggestingTopic(false);
    setTopicSuggestionError("");
    setSuggestingExplanationIndex(null);
    setExplanationSuggestionErrors({});
  }, [itemId]);

  if (!item) return <Navigate to="/admin/readings" replace />;
  if (!draft || draft.id !== item.id) return null;

  const suggestTitle = async () => {
    const passage = draft.passage.trim();
    const draftId = draft.id;
    if (!passage) {
      setTitleSuggestionError(t("admin.passageRequired"));
      return;
    }
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;
    setIsSuggestingTitle(true);
    setTitleSuggestionError("");
    try {
      const title = await onSuggestTitleRequest(passage, draft.language);
      if (!title.trim()) throw new Error(t("admin.titleSuggestionEmpty"));
      if (suggestionRequestRef.current !== requestId) return;
      setDraft((current) =>
        current?.id === draftId ? { ...current, title: title.trim() } : current,
      );
    } catch (suggestionError) {
      if (suggestionRequestRef.current !== requestId) return;
      setTitleSuggestionError(
        errorMessage(suggestionError, "admin.titleSuggestionFailed"),
      );
    } finally {
      if (suggestionRequestRef.current === requestId) setIsSuggestingTitle(false);
    }
  };

  const suggestTopic = async () => {
    const passage = draft.passage.trim();
    const draftId = draft.id;
    if (!passage) {
      setTopicSuggestionError(t("admin.passageRequired"));
      return;
    }
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;
    setIsSuggestingTopic(true);
    setTopicSuggestionError("");
    try {
      const topic = await onSuggestTopicRequest(passage, draft.language);
      if (!readingTopics.includes(topic)) {
        throw new Error(t("admin.topicSuggestionInvalid"));
      }
      if (suggestionRequestRef.current !== requestId) return;
      setDraft((current) =>
        current?.id === draftId ? { ...current, topic } : current,
      );
    } catch (suggestionError) {
      if (suggestionRequestRef.current !== requestId) return;
      setTopicSuggestionError(
        errorMessage(suggestionError, "admin.topicSuggestionFailed"),
      );
    } finally {
      if (suggestionRequestRef.current === requestId) setIsSuggestingTopic(false);
    }
  };

  const suggestExplanation = async (questionIndex: number) => {
    const passage = draft.passage.trim();
    const draftId = draft.id;
    const question = draft.questions[questionIndex];
    if (
      !passage ||
      !question?.question.trim() ||
      question.choices.some((choice) => !choice.text.trim())
    ) {
      setExplanationSuggestionErrors((current) => ({
        ...current,
        [questionIndex]: t("admin.explanationRequired"),
      }));
      return;
    }
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;
    setSuggestingExplanationIndex(questionIndex);
    setExplanationSuggestionErrors((current) => ({ ...current, [questionIndex]: "" }));
    try {
      const explanation = await onSuggestExplanationRequest(
        passage,
        question.question.trim(),
        question.choices,
        draft.language,
      );
      if (!explanation.trim()) throw new Error(t("admin.explanationSuggestionEmpty"));
      if (suggestionRequestRef.current !== requestId) return;
      setDraft((current) => {
        if (!current || current.id !== draftId) return current;
        const questions = current.questions.map((entry, index) =>
          index === questionIndex
            ? { ...entry, explanation: explanation.trim() }
            : entry,
        );
        const firstQuestion = questions[0];
        return {
          ...current,
          questions,
          question: firstQuestion.question,
          choices: firstQuestion.choices,
          explanation: firstQuestion.explanation,
        };
      });
    } catch (suggestionError) {
      if (suggestionRequestRef.current !== requestId) return;
      setExplanationSuggestionErrors((current) => ({
        ...current,
        [questionIndex]: errorMessage(
          suggestionError,
          "admin.explanationSuggestionFailed",
        ),
      }));
    } finally {
      if (suggestionRequestRef.current === requestId) {
        setSuggestingExplanationIndex(null);
      }
    }
  };

  return (
    <AdminEdit
      item={item}
      draft={draft}
      setDraft={setDraft}
      onSave={onSave}
      onHold={() => onHold(item)}
      onPublish={() => onPublish(draft)}
      onDelete={() => onDelete(item)}
      onBack={onBack}
      isSaving={isSaving}
      onSuggestTitle={() => void suggestTitle()}
      isSuggestingTitle={isSuggestingTitle}
      titleSuggestionError={titleSuggestionError}
      onSuggestTopic={() => void suggestTopic()}
      isSuggestingTopic={isSuggestingTopic}
      topicSuggestionError={topicSuggestionError}
      onSuggestExplanation={(questionIndex) => void suggestExplanation(questionIndex)}
      suggestingExplanationIndex={suggestingExplanationIndex}
      explanationSuggestionErrors={explanationSuggestionErrors}
      onConfirmQuestionTruncation={onConfirmQuestionTruncation}
    />
  );
}
