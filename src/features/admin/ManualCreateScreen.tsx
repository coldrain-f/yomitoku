import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import { readingTopics } from "../../lib/readingPolicy";
import type {
  ManualReadingDraft,
  ReadingItem,
  ReadingLanguage,
  StateSetter,
  Topic,
} from "../../types";
import { AdminEdit } from "./AdminEdit";

interface ManualCreateScreenProps {
  values: ManualReadingDraft;
  setValues: StateSetter<ManualReadingDraft>;
  isSaving: boolean;
  error: string;
  onSave: () => void;
  onBack: () => void;
  onSuggestTitle: (
    passage: string,
    language: ReadingLanguage,
  ) => Promise<string>;
  onSuggestTopic: (
    passage: string,
    language: ReadingLanguage,
  ) => Promise<Topic>;
  onSuggestExplanation: (
    passage: string,
    question: string,
    choices: ManualReadingDraft["choices"],
    language: ReadingLanguage,
  ) => Promise<string>;
  onConfirmQuestionTruncation: (
    removedQuestionCount: number,
    onConfirm: () => void,
  ) => void;
}

export function ManualCreateScreen({
  values,
  setValues,
  isSaving,
  error,
  onSave,
  onBack,
  onSuggestTitle,
  onSuggestTopic,
  onSuggestExplanation,
  onConfirmQuestionTruncation,
}: ManualCreateScreenProps) {
  const { t, errorMessage } = useI18n();
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [titleSuggestionError, setTitleSuggestionError] = useState("");
  const [isSuggestingTopic, setIsSuggestingTopic] = useState(false);
  const [topicSuggestionError, setTopicSuggestionError] = useState("");
  const [suggestingExplanationIndex, setSuggestingExplanationIndex] = useState<number | null>(null);
  const [explanationSuggestionErrors, setExplanationSuggestionErrors] = useState<
    Record<number, string>
  >({});
  const suggestTitle = async () => {
    const passage = values.passage.trim();
    if (!passage) {
      setTitleSuggestionError(t("admin.passageRequired"));
      return;
    }
    setIsSuggestingTitle(true);
    setTitleSuggestionError("");
    try {
      const title = await onSuggestTitle(passage, values.language);
      if (!title.trim()) throw new Error(t("admin.titleSuggestionEmpty"));
      setValues((current) => ({ ...current, title: title.trim() }));
    } catch (suggestionError) {
      setTitleSuggestionError(errorMessage(suggestionError, "admin.titleSuggestionFailed"));
    } finally {
      setIsSuggestingTitle(false);
    }
  };
  const suggestTopic = async () => {
    const passage = values.passage.trim();
    if (!passage) {
      setTopicSuggestionError(t("admin.passageRequired"));
      return;
    }
    setIsSuggestingTopic(true);
    setTopicSuggestionError("");
    try {
      const topic = await onSuggestTopic(passage, values.language);
      if (!readingTopics.includes(topic)) {
        throw new Error(t("admin.topicSuggestionInvalid"));
      }
      setValues((current) => ({ ...current, topic }));
    } catch (suggestionError) {
      setTopicSuggestionError(errorMessage(suggestionError, "admin.topicSuggestionFailed"));
    } finally {
      setIsSuggestingTopic(false);
    }
  };
  const suggestExplanation = async (questionIndex: number) => {
    const passage = values.passage.trim();
    const question = values.questions[questionIndex];
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
    setSuggestingExplanationIndex(questionIndex);
    setExplanationSuggestionErrors((current) => ({ ...current, [questionIndex]: "" }));
    try {
      const explanation = await onSuggestExplanation(
        passage,
        question.question.trim(),
        question.choices,
        values.language,
      );
      if (!explanation.trim()) throw new Error(t("admin.explanationSuggestionEmpty"));
      setValues((current) => ({
        ...current,
        ...(questionIndex === 0 ? { explanation: explanation.trim() } : {}),
        questions: current.questions.map((entry, index) =>
          index === questionIndex ? { ...entry, explanation: explanation.trim() } : entry,
        ),
      }));
    } catch (suggestionError) {
      setExplanationSuggestionErrors((current) => ({
        ...current,
        [questionIndex]: errorMessage(
          suggestionError,
          "admin.explanationSuggestionFailed",
        ),
      }));
    } finally {
      setSuggestingExplanationIndex(null);
    }
  };
  const draft: ReadingItem = {
    id: "manual-draft",
    status: "review",
    title: values.title,
    language: values.language,
    officialLevel: values.officialLevel,
    perceivedLevel: values.officialLevel,
    perceivedVotes: 0,
    itemAccuracy: null,
    lengthType: values.lengthType,
    topic: values.topic,
    recommendedSeconds: values.recommendedSeconds,
    contentSource: "manual",
    createdAt: "",
    updatedAt: "",
    publishedAt: null,
    myFirstSubmissionTimedOut: false,
    myScore: null,
    myScoreReason: null,
    isBookmarked: false,
    passage: values.passage,
    question: values.question,
    choices: values.choices,
    explanation: values.explanation,
    questions: values.questions,
    quality: 0,
    reportCount: 0,
    reports: [],
    validations: [],
  };

  return (
    <AdminEdit
      item={draft}
      draft={draft}
      setDraft={(next) =>
        setValues({
          title: next.title,
          language: next.language,
          officialLevel: next.officialLevel,
          lengthType: next.lengthType,
          topic: next.topic,
          recommendedSeconds: next.recommendedSeconds,
          passage: next.passage,
          question: next.question,
          choices: next.choices,
          explanation: next.explanation,
          questions: next.questions,
        })
      }
      onSave={onSave}
      onHold={() => {}}
      onPublish={() => {}}
      onDelete={() => {}}
      onBack={onBack}
      manual
      isSaving={isSaving}
      error={error}
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
