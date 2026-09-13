import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock3,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { OptionButtons } from "../../components/ui/OptionButtons";
import { useI18n } from "../../lib/i18n";
import { formatDate, minimumVotes, statusClass } from "../../lib/reading";
import {
  defaultGenerationLevelByLanguage,
  levelsForLanguage,
  readingLanguages,
  readingTopics,
  recommendedSecondsByLength,
} from "../../lib/readingPolicy";
import type {
  DifficultyLevel,
  LengthType,
  ReadingItem,
  ReadingLanguage,
  Topic,
} from "../../types";
import { itemStatusLabel } from "./adminPresentation";
import { ValidationRecords } from "./ValidationRecords";

interface AdminEditProps {
  item: ReadingItem;
  draft: ReadingItem;
  setDraft: (next: ReadingItem) => void;
  onSave: () => void;
  onHold: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onBack: () => void;
  manual?: boolean;
  isSaving?: boolean;
  error?: string;
  onSuggestTitle?: () => void;
  isSuggestingTitle?: boolean;
  titleSuggestionError?: string;
  onSuggestTopic?: () => void;
  isSuggestingTopic?: boolean;
  topicSuggestionError?: string;
  onSuggestExplanation?: (questionIndex: number) => void;
  suggestingExplanationIndex?: number | null;
  explanationSuggestionErrors?: Record<number, string>;
  onConfirmQuestionTruncation?: (
    removedQuestionCount: number,
    onConfirm: () => void,
  ) => void;
}

export function AdminEdit({
  item,
  draft,
  setDraft,
  onSave,
  onHold,
  onPublish,
  onDelete,
  onBack,
  manual = false,
  isSaving = false,
  error = "",
  onSuggestTitle,
  isSuggestingTitle = false,
  titleSuggestionError = "",
  onSuggestTopic,
  isSuggestingTopic = false,
  topicSuggestionError = "",
  onSuggestExplanation,
  suggestingExplanationIndex = null,
  explanationSuggestionErrors = {},
  onConfirmQuestionTruncation,
}: AdminEditProps) {
  const {
    locale,
    t,
    languageLabel,
    levelLabel,
    lengthLabel,
    topicLabel,
    perceivedLabel: localizedPerceivedLabel,
  } = useI18n();
  const [expandedQuestionIndex, setExpandedQuestionIndex] = useState(0);
  const isWorking =
    isSaving || isSuggestingTitle || isSuggestingTopic || suggestingExplanationIndex !== null;
  const questionLimit =
    draft.lengthType === "short" ? 1 : draft.lengthType === "medium" ? 3 : 4;
  const canManageMultipleQuestions = manual || draft.contentSource === "manual";
  const recommendedSecondsForQuestions = (questionCount: number) =>
    recommendedSecondsByLength[draft.lengthType] + (questionCount - 1) * 60;
  useEffect(() => {
    setExpandedQuestionIndex((current) =>
      Math.min(current, Math.max(0, draft.questions.length - 1)),
    );
  }, [draft.questions.length]);
  useEffect(() => {
    const errorIndex = Object.entries(explanationSuggestionErrors).find(
      ([, error]) => Boolean(error),
    )?.[0];
    if (errorIndex !== undefined) setExpandedQuestionIndex(Number(errorIndex));
  }, [explanationSuggestionErrors]);
  const updateQuestions = (questions: ReadingItem["questions"], autoTime = false) => {
    const firstQuestion = questions[0];
    setDraft({
      ...draft,
      questions,
      question: firstQuestion.question,
      choices: firstQuestion.choices,
      explanation: firstQuestion.explanation,
      ...(autoTime ? { recommendedSeconds: recommendedSecondsForQuestions(questions.length) } : {}),
    });
  };
  const updateChoice = (questionIndex: number, choiceIndex: number, text: string) =>
    updateQuestions(
      draft.questions.map((question, currentQuestionIndex) =>
        currentQuestionIndex === questionIndex
          ? {
              ...question,
              choices: question.choices.map((choice, currentChoiceIndex) =>
                currentChoiceIndex === choiceIndex ? { ...choice, text } : choice,
              ),
            }
          : question,
      ),
    );
  const updateQuestion = (
    questionIndex: number,
    values: Partial<ReadingItem["questions"][number]>,
  ) =>
    updateQuestions(
      draft.questions.map((question, currentQuestionIndex) =>
        currentQuestionIndex === questionIndex ? { ...question, ...values } : question,
      ),
    );
  const addQuestion = () => {
    if (draft.questions.length >= questionLimit) return;
    const number = draft.questions.length + 1;
    const choices = Array.from({ length: 4 }, (_, index) => ({
      id: `question-${number}-choice-${index + 1}-${Date.now()}`,
      text: "",
      isCorrect: index === 0,
    }));
    updateQuestions(
      [
        ...draft.questions,
        {
          id: `question-${number}-${Date.now()}`,
          question: "",
          choices,
          explanation: "",
        },
      ],
      true,
    );
    setExpandedQuestionIndex(draft.questions.length);
  };
  const removeQuestion = (questionIndex: number) => {
    if (questionIndex === 0 || draft.questions.length === 1) return;
    updateQuestions(draft.questions.filter((_, index) => index !== questionIndex), true);
    setExpandedQuestionIndex((current) =>
      current >= questionIndex ? Math.max(0, current - 1) : current,
    );
  };
  const changeLengthType = (lengthType: LengthType) => {
    const maximum =
      lengthType === "short" ? 1 : lengthType === "medium" ? 3 : 4;
    const applyChange = () => {
      const questions = draft.questions.slice(0, maximum);
      const firstQuestion = questions[0];
      setDraft({
        ...draft,
        lengthType,
        questions,
        question: firstQuestion.question,
        choices: firstQuestion.choices,
        explanation: firstQuestion.explanation,
        recommendedSeconds:
          recommendedSecondsByLength[lengthType] + (questions.length - 1) * 60,
      });
    };
    const removedQuestionCount = draft.questions.length - maximum;
    if (removedQuestionCount > 0) {
      onConfirmQuestionTruncation?.(removedQuestionCount, applyChange);
      return;
    }
    applyChange();
  };

  return (
    <section
      className={["screen", "screen-admin-edit", manual ? "screen-manual-create" : ""].filter(Boolean).join(" ")}
      aria-label={manual ? t("admin.manualEntry") : t("admin.edit")}
      aria-busy={isWorking}
      data-reading-language={draft.language}
    >
      <div className="paper">
        <div className="admin-edit-heading">
          <div>
            <p className="kicker">{manual ? t("admin.manualEntry") : t("admin.kicker")}</p>
            <h1 className="screen-title">{manual ? t("admin.manualEntry") : t("admin.edit")}</h1>
          </div>
          <span className={manual ? "badge" : statusClass(item.status)}>
            {manual ? t("admin.beforeReview") : itemStatusLabel(item.status, t)}
          </span>
        </div>
        <fieldset className="admin-edit-form" disabled={isWorking}>
          <div className="admin-field admin-field-wide admin-title-field">
            <div className="admin-field-label-row">
              <span className="form-label">{t("admin.title")}</span>
              {onSuggestTitle ? (
                <button
                  className="text-button admin-ai-suggest"
                  type="button"
                  onClick={onSuggestTitle}
                  disabled={isSuggestingTitle || !draft.passage.trim()}
                >
                  <Icon icon={Sparkles} />
                  {isSuggestingTitle ? t("admin.suggestingTitle") : t("admin.suggestTitle")}
                </button>
              ) : null}
            </div>
            <input
              className="input-field"
              type="text"
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
            {titleSuggestionError ? (
              <p className="editor-error" role="alert">
                {titleSuggestionError}
              </p>
            ) : null}
          </div>
          <div className="admin-metadata-grid">
            <label className="admin-field">
              <span className="form-label">{t("admin.contentLanguage")}</span>
              <select
                className="select-field"
                value={draft.language}
                onChange={(event) => {
                  const language = event.target.value as ReadingLanguage;
                  setDraft({
                    ...draft,
                    language,
                    officialLevel: levelsForLanguage(language).includes(draft.officialLevel)
                      ? draft.officialLevel
                      : defaultGenerationLevelByLanguage[language],
                  });
                }}
              >
                {readingLanguages.map((language) => (
                  <option key={language} value={language}>
                    {languageLabel(language)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="form-label">{t("admin.level")}</span>
              <select
                className="select-field"
                value={draft.officialLevel}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    officialLevel: event.target.value as DifficultyLevel,
                  })
                }
              >
                {levelsForLanguage(draft.language).map((value) => (
                  <option key={value}>{levelLabel(value)}</option>
                ))}
              </select>
            </label>
            {!manual ? <div className="admin-field admin-summary-field">
              <span className="form-label">{t("admin.perceivedLevel")}</span>
              <div className="admin-summary-value">
                <strong>{localizedPerceivedLabel(item)}</strong>
                <span>
                  {t("admin.responses", { count: item.perceivedVotes })} ·{" "}
                  {item.perceivedVotes >= minimumVotes ? t("admin.public") : t("admin.private")}
                </span>
              </div>
            </div> : null}
            <label className="admin-field">
              <span className="form-label">{t("admin.length")}</span>
              <select
                className="select-field"
                value={draft.lengthType}
                onChange={(event) => changeLengthType(event.target.value as LengthType)}
              >
                {(["short", "medium", "long"] as const).map((value) => (
                  <option value={value} key={value}>
                    {lengthLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="form-label">{t("admin.recommendedSeconds")}</span>
              <input
                className="input-field"
                type="number"
                min="1"
                max="14400"
                value={draft.recommendedSeconds}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    recommendedSeconds: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </label>
            <div className="admin-field">
              <div className="admin-field-label-row">
                <span className="form-label">{t("admin.topic")}</span>
                {onSuggestTopic ? (
                  <button
                    className={
                      "admin-topic-suggest" +
                      (isSuggestingTopic ? " is-loading" : "")
                    }
                    type="button"
                    onClick={onSuggestTopic}
                    disabled={isSuggestingTopic || !draft.passage.trim()}
                    aria-label={isSuggestingTopic ? t("admin.suggestingTopic") : t("admin.suggestTopic")}
                    title={isSuggestingTopic ? t("admin.suggestingTopic") : t("admin.suggestTopic")}
                  >
                    <Icon icon={isSuggestingTopic ? RefreshCw : Sparkles} />
                  </button>
                ) : null}
              </div>
              <select
                className="select-field"
                value={draft.topic}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    topic: event.target.value as Topic,
                  })
                }
              >
                {readingTopics.map((topic) => (
                  <option key={topic}>{topicLabel(topic)}</option>
                ))}
              </select>
              {topicSuggestionError ? (
                <p className="editor-error" role="alert">
                  {topicSuggestionError}
                </p>
              ) : null}
            </div>
          </div>
          <label className="admin-field admin-field-wide">
            <span className="form-label">{t("admin.passage")}</span>
            <textarea
              className="admin-textarea"
              value={draft.passage}
              onChange={(event) =>
                setDraft({ ...draft, passage: event.target.value })
              }
            />
          </label>
          <section className="admin-questions-section">
            <div className="admin-options-heading">
              <span className="form-label">
                {t("admin.questionCount", { count: draft.questions.length, limit: questionLimit })}
              </span>
              {canManageMultipleQuestions ? (
                <button
                  className="text-button admin-add-question"
                  type="button"
                  onClick={addQuestion}
                  disabled={draft.questions.length >= questionLimit}
                >
                  <Icon icon={Plus} />
                  {t("admin.addQuestion")}
                </button>
              ) : null}
            </div>
            {draft.questions.map((question, questionIndex) => (
              <section className="admin-question-editor" key={question.id}>
                <div className="admin-question-heading">
                  <button
                    className="admin-question-toggle"
                    type="button"
                    aria-expanded={expandedQuestionIndex === questionIndex}
                    aria-controls={`question-editor-${question.id}`}
                    onClick={() =>
                      setExpandedQuestionIndex((current) =>
                        current === questionIndex ? -1 : questionIndex,
                      )
                    }
                  >
                    <span className="admin-question-title">
                      <strong>{t("admin.questionNumber", { number: String(questionIndex + 1).padStart(2, "0") })}</strong>
                      <span className="admin-question-summary">
                        {question.question.trim() || t("admin.questionMissing")}
                      </span>
                    </span>
                    <span className="admin-question-toggle-meta">
                      <span
                        className={
                          "admin-question-status" +
                          (question.explanation.trim() ? " is-complete" : "")
                        }
                      >
                        {question.explanation.trim() ? t("admin.explanationReady") : t("admin.explanationMissing")}
                      </span>
                      <Icon
                        icon={
                          expandedQuestionIndex === questionIndex
                            ? ChevronUp
                            : ChevronDown
                        }
                      />
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    title={t("admin.deleteQuestion", { number: questionIndex + 1 })}
                    aria-label={t("admin.deleteQuestion", { number: questionIndex + 1 })}
                    disabled={!canManageMultipleQuestions || questionIndex === 0}
                    onClick={() => removeQuestion(questionIndex)}
                  >
                    <Icon icon={Trash2} />
                  </button>
                </div>
                {expandedQuestionIndex === questionIndex ? (
                  <div
                    className="admin-question-content"
                    id={`question-editor-${question.id}`}
                  >
                <label className="admin-field admin-field-wide">
                  <span className="form-label">{t("admin.question")}</span>
                  <textarea
                    className="admin-textarea admin-question-textarea"
                    value={question.question}
                    onChange={(event) =>
                      updateQuestion(questionIndex, { question: event.target.value })
                    }
                  />
                </label>
                <section className="admin-options-section">
                  <div className="admin-options-heading">
                    <span className="form-label">{t("admin.choices")}</span>
                    <label className="admin-answer-select">
                      {t("admin.answer")}{" "}
                      <select
                        className="select-field"
                        value={question.choices.findIndex((choice) => choice.isCorrect)}
                        onChange={(event) =>
                          updateQuestion(questionIndex, {
                            choices: question.choices.map((choice, index) => ({
                              ...choice,
                              isCorrect: index === Number(event.target.value),
                            })),
                          })
                        }
                      >
                        {question.choices.map((choice, index) => (
                          <option value={index} key={choice.id}>
                            {String(index + 1).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="admin-options-list">
                    {question.choices.map((choice, choiceIndex) => (
                      <label className="admin-option" key={choice.id}>
                        <span className="answer-number">
                          {String(choiceIndex + 1).padStart(2, "0")}
                        </span>
                        <input
                          className="input-field"
                          type="text"
                          value={choice.text}
                          onChange={(event) =>
                            updateChoice(questionIndex, choiceIndex, event.target.value)
                          }
                        />
                      </label>
                    ))}
                  </div>
                </section>
                <div className="admin-field admin-field-wide">
                  <div className="admin-field-label-row">
                    <span className="form-label">{t("admin.explanation")}</span>
                    {onSuggestExplanation ? (
                      <button
                        className="text-button admin-ai-suggest"
                        type="button"
                        onClick={() => onSuggestExplanation(questionIndex)}
                        disabled={
                          suggestingExplanationIndex !== null ||
                          !draft.passage.trim() ||
                          !question.question.trim() ||
                          question.choices.some((choice) => !choice.text.trim())
                        }
                      >
                        <Icon icon={Sparkles} />
                        {suggestingExplanationIndex === questionIndex
                          ? t("admin.suggestingExplanation")
                          : t("admin.suggestExplanation")}
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    className="admin-textarea admin-explanation-textarea"
                    value={question.explanation}
                    onChange={(event) =>
                      updateQuestion(questionIndex, { explanation: event.target.value })
                    }
                  />
                  {explanationSuggestionErrors[questionIndex] ? (
                    <p className="editor-error" role="alert">
                      {explanationSuggestionErrors[questionIndex]}
                    </p>
                  ) : null}
                </div>
                  </div>
                ) : null}
              </section>
            ))}
          </section>
          {manual && error ? <p className="editor-error" role="alert">{error}</p> : null}
          {!manual ? <section className="admin-insights">
            <div className="admin-section-heading">
              <h2 className="admin-section-title">{t("admin.itemResponse")}</h2>
              <span className="admin-section-note">
                {t("admin.evaluations", { count: item.perceivedVotes })}
              </span>
            </div>
            <dl className="admin-insight-list">
              <div>
                <dt>{t("admin.itemQuality")}</dt>
                <dd>{item.quality ? `${item.quality} / 5` : t("admin.noRating")}</dd>
              </div>
              <div>
                <dt>{t("admin.perceivedLevel")}</dt>
                <dd>
                  {item.perceivedVotes >= minimumVotes
                    ? `${levelLabel(item.perceivedLevel)} · ${t("admin.responses", { count: item.perceivedVotes })}`
                    : `${localizedPerceivedLabel(item)} · ${t("admin.responses", { count: item.perceivedVotes })}`}
                </dd>
              </div>
              <div>
                <dt>{t("admin.errorReports")}</dt>
                <dd>{item.reportCount}건</dd>
              </div>
            </dl>
            <section className="admin-report-section" aria-label={t("admin.reportDetails")}>
              <div className="admin-section-heading">
                <h3 className="admin-subsection-title">{t("admin.reportDetails")}</h3>
                <span className="admin-section-note">{item.reports.length}건</span>
              </div>
              {item.reports.length ? (
                <div className="admin-report-list">
                  {item.reports.map((report) => (
                    <article className="admin-report-item" key={report.id}>
                      <div className="admin-record-meta">
                        <span className="badge">
                          {report.status === "open" ? t("admin.reportReceived") : report.status}
                        </span>
                        <time className="row-date">{formatDate(report.createdAt, locale)}</time>
                      </div>
                      <p>{report.content}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="admin-empty-detail">{t("admin.emptyReports")}</p>
              )}
            </section>
          </section> : null}
          {!manual ? <ValidationRecords validations={item.validations} /> : null}
        </fieldset>
        <div className="footer-actions admin-edit-actions">
          <div className="admin-edit-secondary">
            <button
              className="link-button"
              type="button"
              onClick={() => onBack()}
              disabled={isWorking}
            >
              {t("admin.backToManagement")}
            </button>
            {!manual ? <button
              className="link-button preview-delete"
              type="button"
              onClick={onDelete}
              disabled={isWorking}
            >
              <Icon icon={Trash2} />
              {t("admin.delete")}
            </button> : null}
          </div>
          <div className="admin-edit-main">
            {!manual ? <button className="text-button" type="button" onClick={onHold} disabled={isWorking}>
              <Icon icon={Clock3} />
              {item.status === "held"
                ? t("admin.cancelHold")
                : item.status === "published"
                  ? t("admin.switchHold")
                  : t("admin.hold")}
            </button> : null}
            {!manual && item.status !== "published" ? (
              <button className="text-button" type="button" onClick={onPublish} disabled={isWorking}>
                <Icon icon={Upload} />
                {t("admin.publish")}
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={onSave} disabled={isWorking}>
              <Icon icon={Save} />
              {isSaving ? t("admin.saving") : manual ? t("admin.saveForReview") : t("admin.save")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

