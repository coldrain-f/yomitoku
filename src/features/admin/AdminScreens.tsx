import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { ListPagination } from "../../components/ui/ListPagination";
import { LoadingBar, LoadingOverlay } from "../../components/ui/LoadingBar";
import { OptionButtons } from "../../components/ui/OptionButtons";
import { useI18n, type TranslationFunction } from "../../lib/i18n";
import type {
  GenerationJobHistory,
  GenerationModelOptions,
} from "../../lib/api";
import {
  formatDate,
  minimumVotes,
  statusClass,
} from "../../lib/reading";
import {
  defaultGenerationLevelByLanguage,
  generationLevelsForLanguage,
  levelsForLanguage,
  readingLanguages,
  readingTopics,
  recommendedSecondsByLength,
  recommendedTopic,
} from "../../lib/readingPolicy";
import type {
  AdminFilters,
  DifficultyLevel,
  GenerationValues,
  ItemValidation,
  LengthType,
  ManualReadingDraft,
  ReadingItem,
  ReadingLanguage,
  StateSetter,
  Topic,
} from "../../types";

type Translate = TranslationFunction;

interface AdminScreenProps {
  items: ReadingItem[];
  loading: boolean;
  error: string;
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  filters: AdminFilters;
  query: string;
  setQuery: (query: string) => void;
  onLanguageChange: (language: ReadingLanguage) => void;
  onFilters: () => void;
  onEdit: (item: ReadingItem) => void;
  onGenerate: () => void;
  onManualCreate: () => void;
  onHistory: () => void;
}

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

interface GenerateScreenProps {
  values: GenerationValues;
  setValues: StateSetter<GenerationValues>;
  modelOptions: GenerationModelOptions | null;
  modelError: string;
  isCreating: boolean;
  progressLabel: string;
  error: string;
  onCreate: () => void;
  onBack: () => void;
}

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

interface PreviewScreenProps {
  item: ReadingItem;
  onHold: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onBack: () => void;
}

interface GenerationHistoryScreenProps {
  items: GenerationJobHistory[];
  loading: boolean;
  error: string;
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onBack: () => void;
}

function generationStageLabel(stage: string, t: Translate): string {
  return {
    generate: t("admin.stageGenerate"),
    verify_answer: t("admin.stageVerifyAnswer"),
    verify_quality: t("admin.stageVerifyQuality"),
  }[stage] ?? stage;
}

function validationRoleLabel(role: string, t: Translate): string {
  return {
    schema: t("admin.validationSchema"),
    answer: t("admin.validationAnswer"),
    quality: t("admin.validationQuality"),
  }[role] ?? role;
}

function validationStatusLabel(status: string, t: Translate): string {
  return {
    passed: t("admin.validationPassed"),
    warning: t("admin.validationWarning"),
    failed: t("admin.validationFailed"),
  }[status] ?? status;
}

function itemStatusLabel(status: string, t: Translate): string {
  return {
    review: t("admin.statusReview"),
    held: t("admin.statusHeld"),
    published: t("admin.statusPublished"),
  }[status] ?? status;
}

function validationStatusClass(status: string): string {
  if (status === "passed") return "badge ok";
  if (status === "failed") return "badge danger";
  return "badge";
}

function validationStateFor(validations: ItemValidation[]): "passed" | "warning" | "failed" | "unknown" {
  if (validations.some((validation) => validation.status === "failed")) return "failed";
  if (validations.some((validation) => validation.status === "warning")) return "warning";
  return validations.length ? "passed" : "unknown";
}

function ValidationRecords({
  validations,
  held = false,
}: {
  validations: ItemValidation[];
  held?: boolean;
}) {
  const { t } = useI18n();
  const state = validationStateFor(validations);
  const records = held
    ? validations.filter((validation) => validation.status !== "passed")
    : validations;

  return (
    <section className="admin-validation" aria-label={held ? t("admin.holdReason") : t("admin.validation")}>
      <div className="admin-section-heading">
        <h2 className="admin-section-title">{held ? t("admin.holdReason") : t("admin.validation")}</h2>
        <span className={validationStatusClass(state)}>
          {state === "unknown"
            ? t("admin.noRecords")
            : t("admin.validationPrefix", { status: validationStatusLabel(state, t) })}
        </span>
      </div>
      {records.length ? (
        <div className="admin-validation-records">
          {records.map((validation) => (
            <article className="admin-validation-record" key={`${validation.validatorRole}-${validation.createdAt}`}>
              <div className="admin-validation-record-head">
                <div>
                  <h3 className="admin-subsection-title">
                    {validationRoleLabel(validation.validatorRole, t)}
                  </h3>
                  <p className="admin-record-model">{validation.modelId}</p>
                </div>
                <div className="admin-record-meta">
                  {validation.score !== null ? (
                    <span className="admin-validation-score">{t("admin.points", { score: validation.score })}</span>
                  ) : null}
                  <span className={validationStatusClass(validation.status)}>
                    {validationStatusLabel(validation.status, t)}
                  </span>
                </div>
              </div>
              {validation.issueCodes.length ? (
                <p className="admin-validation-issues">
                  {validation.issueCodes.join(" · ")}
                </p>
              ) : null}
              {validation.evidence.length ? (
                <ul className="admin-validation-evidence">
                  {validation.evidence.map((evidence, index) => (
                    <li key={`${validation.validatorRole}-${index}`}>{evidence}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-empty-detail">
          {held
            ? t("admin.noValidationHeld")
            : t("admin.noValidation")}
        </p>
      )}
    </section>
  );
}

function generationStatusLabel(status: string, t: Translate): string {
  return {
    queued: t("admin.statusQueued"),
    generating: t("admin.statusGenerating"),
    retrying: t("admin.statusRetrying"),
    validating: t("admin.statusValidating"),
    revising: t("admin.statusRevising"),
    ready_for_review: t("admin.statusReady"),
    held: t("admin.statusHeld"),
    failed: t("admin.statusFailed"),
  }[status] ?? status;
}

function generationStatusClass(status: string): string {
  if (status === "failed") return "is-failed";
  if (status === "held") return "is-held";
  if (status === "ready_for_review") return "is-ready";
  if (["queued", "generating", "retrying", "validating", "revising"].includes(status)) {
    return "is-running";
  }
  return "";
}

function formatTokenCount(value: number | null, locale: "ko" | "ja"): string {
  return value === null ? "-" : new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "ko-KR").format(value);
}

function formatCost(value: number | null, t: Translate): string {
  if (value === null) return t("admin.costUnavailable");
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function formatHistoryDate(value: string, locale: "ko" | "ja"): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminScreen({
  items,
  loading,
  error,
  page,
  totalPages,
  totalItems,
  onPageChange,
  filters,
  query,
  setQuery,
  onLanguageChange,
  onFilters,
  onEdit,
  onGenerate,
  onManualCreate,
  onHistory,
}: AdminScreenProps) {
  const {
    locale,
    t,
    languageLabel,
    levelLabel,
    lengthLabel,
    topicLabel,
    perceivedLabel: localizedPerceivedLabel,
  } = useI18n();
  const hasAppliedFilters =
    filters.level !== "all" ||
    filters.length !== "all" ||
    filters.topic !== "all" ||
    filters.status !== "all" ||
    filters.sort !== "created-desc";

  return (
    <section className="screen screen-admin" aria-label={t("admin.management")}>
      <div className="paper flush">
        <div className="paper-head admin-paper-head">
          <div>
            <p className="kicker">{t("admin.kicker")}</p>
            <h1 className="screen-title">{t("admin.management")}</h1>
          </div>
          <p className="list-result-count">{t("admin.itemCount", { count: totalItems })}</p>
        </div>
        <div className="admin-toolbar">
          <div className="filter-search">
            <Icon icon={Search} />
            <input
              className="title-search"
              type="search"
              placeholder={t("admin.searchPlaceholder")}
              aria-label={t("admin.searchLabel")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="list-language-switch">
            <OptionButtons
              value={filters.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabel(language),
              }))}
              onChange={(language) =>
                onLanguageChange(language as ReadingLanguage)
              }
              ariaLabel={t("admin.contentLanguageAria")}
            />
          </div>
          <div className="admin-toolbar-tools">
            <button
              className={`icon-button list-filter-button${hasAppliedFilters ? " is-active" : ""}`}
              type="button"
              aria-label={t("admin.filter")}
              aria-pressed={hasAppliedFilters}
              title={t("admin.filter")}
              onClick={onFilters}
            >
              <Icon icon={SlidersHorizontal} />
            </button>
          </div>
        </div>
        {loading ? <LoadingOverlay label={t("admin.loadingItems")} /> : null}
        {error ? <p className="list-load-error" role="alert">{error}</p> : null}
        <div className="admin-list" aria-busy={loading}>
          {items.map((item) => (
            <button
              className="admin-row"
              type="button"
              key={item.id}
              onClick={() => onEdit(item)}
            >
              <span>
                <span className="admin-row-title" lang={item.language}>{item.title}</span>
                <span className="row-meta">
                  <span className="badge row-level">{levelLabel(item.officialLevel)}</span>
                  {item.perceivedVotes >= minimumVotes ? (
                    <span className="badge row-perceived">
                      {localizedPerceivedLabel(item)} · {t("admin.responses", { count: item.perceivedVotes })}
                    </span>
                  ) : null}
                  <span className="badge">{lengthLabel(item.lengthType)}</span>
                  <span className="row-topic">{topicLabel(item.topic)}</span>
                </span>
              </span>
              <span className="admin-row-state">
                <span className={statusClass(item.status)}>
                  {itemStatusLabel(item.status, t)}
                </span>
                <time className="row-date">{t("admin.created", { date: formatDate(item.createdAt, locale) })}</time>
                <time className="row-date">{t("admin.updated", { date: formatDate(item.updatedAt, locale) })}</time>
              </span>
              <Icon icon={Pencil} />
            </button>
          ))}
        </div>
        {!loading && items.length === 0 ? (
          <div className="reading-list-empty">
            <p>{t("admin.emptyItems")}</p>
          </div>
        ) : (
          <ListPagination
            page={page}
            totalPages={totalPages}
            onChange={onPageChange}
            ariaLabel={t("admin.itemsPagination")}
          />
        )}
        <div className="home-actions admin-list-actions">
          <button className="text-button" type="button" onClick={onHistory}>
            <Icon icon={History} />
            {t("admin.history")}
          </button>
          <button className="text-button" type="button" onClick={onManualCreate}>
            <Icon icon={Pencil} />
            {t("admin.manualEntry")}
          </button>
          <button className="primary-button" type="button" onClick={onGenerate}>
            <Icon icon={Plus} />{t("admin.newReading")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function GenerationHistoryScreen({
  items,
  loading,
  error,
  page,
  totalPages,
  totalItems,
  onPageChange,
  onRefresh,
  onBack,
}: GenerationHistoryScreenProps) {
  const { locale, t, languageLabel, levelLabel, lengthLabel, topicLabel } = useI18n();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  return (
    <section className="screen screen-generation-history" aria-label={t("admin.history")}>
      <div className="paper flush">
        <div className="paper-head admin-paper-head">
          <div>
            <p className="kicker">{t("admin.kicker")}</p>
            <h1 className="screen-title">{t("admin.history")}</h1>
          </div>
          <div className="admin-head-actions">
            <button
              className="icon-button"
              type="button"
              title={t("admin.management")}
              aria-label={t("admin.management")}
              onClick={onBack}
            >
              <Icon icon={ArrowLeft} />
            </button>
            <button
              className="icon-button"
              type="button"
              title={t("admin.refresh")}
              aria-label={t("admin.refresh")}
              onClick={onRefresh}
              disabled={loading}
            >
              <Icon icon={RefreshCw} />
            </button>
          </div>
        </div>
        <div className="generation-history-toolbar">
          <span>{t("admin.recentJobs", { count: totalItems })}</span>
        </div>
        {loading ? <LoadingBar label={t("admin.loadingHistory")} /> : null}
        {error ? <p className="generation-history-error" role="alert">{error}</p> : null}
        <div className="generation-history-list" aria-busy={loading}>
          {items.map((job) => {
            const expanded = expandedJobId === job.id;
            const generationAttempts = job.usageEvents.filter(
              (event) => event.stage === "generate",
            ).length;
            return (
              <article className="generation-history-row" key={job.id}>
                <button
                  className="generation-history-trigger"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedJobId((current) => (current === job.id ? null : job.id))
                  }
                >
                  <span className="generation-history-main">
                    <span className="generation-history-title">
                      {levelLabel(job.conditions.officialLevel)} {lengthLabel(job.conditions.lengthType)} · {topicLabel(job.conditions.topic)}
                    </span>
                    <span className="row-meta">
                      <span className="badge row-level">{languageLabel(job.conditions.language)}</span>
                      <span className="badge">{job.promptVersion}</span>
                      {generationAttempts > 1 ? (
                        <span className="badge">{t("admin.generationCount", { count: generationAttempts })}</span>
                      ) : null}
                      {job.revisionCount > 0 ? (
                        <span className="badge">{t("admin.revisionCount", { count: job.revisionCount })}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="generation-history-state">
                    <span className={`generation-job-status ${generationStatusClass(job.status)}`}>
                      {generationStatusLabel(job.status, t)}
                    </span>
                    <strong>{formatCost(job.actualCostUsd, t)}</strong>
                    <time dateTime={job.createdAt}>{formatHistoryDate(job.createdAt, locale)}</time>
                  </span>
                  <Icon icon={expanded ? ChevronUp : ChevronDown} />
                </button>
                {expanded ? (
                  <div className="generation-history-detail">
                    <dl className="generation-history-summary">
                      <div>
                        <dt>{t("admin.generatorAi")}</dt>
                        <dd>{job.generatorModel}</dd>
                      </div>
                      <div>
                        <dt>{t("admin.validatorAi")}</dt>
                        <dd>{job.answerValidatorModel === job.qualityValidatorModel
                          ? job.answerValidatorModel
                          : `${job.answerValidatorModel} / ${job.qualityValidatorModel}`}</dd>
                      </div>
                      <div>
                        <dt>{t("admin.inputOutput")}</dt>
                        <dd>{formatTokenCount(job.inputTokens, locale)} / {formatTokenCount(job.outputTokens, locale)} {t("admin.tokens")}</dd>
                      </div>
                      <div>
                        <dt>{t("admin.cacheWriteRead")}</dt>
                        <dd>{formatTokenCount(job.cacheCreationInputTokens, locale)} / {formatTokenCount(job.cacheReadInputTokens, locale)} {t("admin.tokens")}</dd>
                      </div>
                    </dl>
                    {job.conditions.keywords.length > 0 ? (
                      <div className="generation-history-keywords">
                        <span>{t("admin.keywords")}</span>
                        <p>{job.conditions.keywords.join(" · ")}</p>
                      </div>
                    ) : null}
                    {job.errorDetail ? (
                      <p className="generation-history-failure">{job.errorDetail}</p>
                    ) : null}
                    {job.usageComplete === false ? (
                      <p className="generation-history-failure">{t("admin.usageUnverified")}</p>
                    ) : null}
                    {job.usageEvents.length > 0 ? (
                      <div className="generation-usage-events">
                        <div className="generation-usage-event generation-usage-event-head" aria-hidden="true">
                          <span>{t("admin.stage")}</span>
                          <span>{t("admin.model")}</span>
                          <span>{t("admin.input")}</span>
                          <span>{t("admin.cacheWrite")}</span>
                          <span>{t("admin.cacheRead")}</span>
                          <span>{t("admin.output")}</span>
                          <span>{t("admin.cost")}</span>
                        </div>
                        {job.usageEvents.map((event) => (
                          <div className="generation-usage-event" key={event.eventIndex}>
                            <span>{generationStageLabel(event.stage, t)}</span>
                            <span className="generation-usage-model">{event.modelId}</span>
                            <span>{formatTokenCount(event.usageStatus === "unknown" || event.usageStatus === "pending" ? null : event.inputTokens, locale)}</span>
                            <span>{formatTokenCount(event.usageStatus === "unknown" || event.usageStatus === "pending" ? null : event.cacheCreationInputTokens, locale)}</span>
                            <span>{formatTokenCount(event.usageStatus === "unknown" || event.usageStatus === "pending" ? null : event.cacheReadInputTokens, locale)}</span>
                            <span>{formatTokenCount(event.usageStatus === "unknown" || event.usageStatus === "pending" ? null : event.outputTokens, locale)}</span>
                            <span title={event.stopReason ?? undefined}>{formatCost(event.actualCostUsd, t)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        {!loading && items.length === 0 ? (
          <div className="reading-list-empty">
            <p>{t("admin.emptyHistory")}</p>
          </div>
        ) : (
          <ListPagination
            page={page}
            totalPages={totalPages}
            onChange={onPageChange}
            ariaLabel={t("admin.historyPagination")}
          />
        )}
      </div>
    </section>
  );
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

export function GenerateScreen({
  values,
  setValues,
  modelOptions,
  modelError,
  isCreating,
  progressLabel,
  error,
  onCreate,
  onBack,
}: GenerateScreenProps) {
  const { t, languageLabel, levelLabel, lengthLabel, topicLabel } = useI18n();
  const keywordInputs = values.keywords.length > 0 ? values.keywords : [""];
  const updateKeyword = (index: number, value: string) => {
    const keywords = [...keywordInputs];
    keywords[index] = value;
    setValues({ ...values, keywords });
  };
  const removeKeyword = (index: number) => {
    setValues({
      ...values,
      keywords: keywordInputs.filter((_, keywordIndex) => keywordIndex !== index),
    });
  };
  const addKeyword = () => {
    if (keywordInputs.length >= 5) return;
    setValues({ ...values, keywords: [...keywordInputs, ""] });
  };

  return (
    <section
      className="screen screen-generate"
      aria-label={t("admin.generateAria")}
      aria-busy={isCreating}
    >
      <div className="paper">
        <p className="kicker">{t("admin.kicker")}</p>
        <h1 className="screen-title">{t("admin.generate")}</h1>
        <div className="form-grid generation-form-grid">
          <div className="form-section">
            <span className="form-label">{t("admin.contentLanguage")}</span>
            <OptionButtons
              value={values.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabel(language),
              }))}
              onChange={(value) => {
                const language = value as ReadingLanguage;
                setValues({
                  ...values,
                  language,
                  level: defaultGenerationLevelByLanguage[language],
                });
              }}
              ariaLabel={t("admin.contentLanguage")}
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.level")}</span>
            <OptionButtons
              value={values.level}
              options={generationLevelsForLanguage(values.language).map((value) => ({
                value,
                label: levelLabel(value),
              }))}
              onChange={(level) =>
                setValues({
                  ...values,
                  level: level as DifficultyLevel,
                })
              }
              ariaLabel={t("admin.level")}
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.length")}</span>
            <OptionButtons
              value={values.length}
              options={(["short", "medium", "long"] as const).map((value) => ({
                value,
                label: lengthLabel(value),
              }))}
              onChange={(length) =>
                setValues({
                  ...values,
                  length: length as LengthType,
                })
              }
              ariaLabel={t("admin.length")}
              disabled={isCreating}
            />
          </div>
          <div className="form-section">
            <div className="generate-topic-field">
              <span className="form-label">{t("admin.topic")}</span>
              <select
                className="select-field"
                value={values.topic}
                disabled={isCreating}
                onChange={(event) =>
                  setValues({
                    ...values,
                    topic: event.target.value as GenerationValues["topic"],
                  })
                }
              >
                <option value={recommendedTopic}>{t("admin.recommendedRandom")}</option>
                {readingTopics.map((topic) => (
                  <option key={topic}>{topicLabel(topic)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.generatorAi")}</span>
            <select
              className="select-field"
              value={values.generatorModel}
              disabled={isCreating || !modelOptions}
              onChange={(event) =>
                setValues({
                  ...values,
                  generatorModel: event.target.value,
                })
              }
            >
              {modelOptions ? (
                modelOptions.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              ) : (
                <option value="">{modelError || t("admin.modelsLoading")}</option>
              )}
            </select>
          </div>
          <div className="form-section">
            <span className="form-label">{t("admin.validatorAi")}</span>
            <select
              className="select-field"
              value={values.validatorModel}
              disabled={isCreating || !modelOptions}
              onChange={(event) =>
                setValues({
                  ...values,
                  validatorModel: event.target.value,
                })
              }
            >
              {modelOptions ? (
                modelOptions.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              ) : (
                <option value="">{modelError || t("admin.modelsLoading")}</option>
              )}
            </select>
          </div>
          <div className="form-section generation-keywords-section">
            <span className="form-label">{t("admin.keywords")}</span>
            <div className="generation-keyword-list">
              {keywordInputs.map((keyword, index) => (
                <div className="generation-keyword-input" key={`keyword-${index}`}>
                  <input
                    className="input-field"
                    type="text"
                    value={keyword}
                    placeholder={t("admin.keyword", { number: index + 1 })}
                    aria-label={t("admin.keyword", { number: index + 1 })}
                    maxLength={40}
                    disabled={isCreating}
                    onChange={(event) => updateKeyword(index, event.target.value)}
                  />
                  {keywordInputs.length > 1 ? (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t("admin.deleteKeywordItem", { number: index + 1 })}
                      title={t("admin.deleteKeyword")}
                      disabled={isCreating}
                      onClick={() => removeKeyword(index)}
                    >
                      <Icon icon={X} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              className="link-button generation-keyword-add"
              type="button"
              disabled={isCreating || keywordInputs.length >= 5}
              onClick={addKeyword}
            >
              <Icon icon={Plus} />
              {t("admin.addKeyword")}
            </button>
          </div>
        </div>
        {values.language === "ja" ? (
          <div className="furigana-row">
            <span className="form-label">{t("admin.furigana")}</span>
            <OptionButtons
              value="off"
              options={[
                { value: "off", label: t("admin.furiganaOff") },
                { value: "on", label: t("admin.furiganaOn"), disabled: true },
              ]}
              onChange={() => {}}
              ariaLabel={t("admin.furigana")}
              disabled={isCreating}
            />
          </div>
        ) : null}
        {isCreating ? (
          <LoadingBar className="generation-progress" label={progressLabel} />
        ) : null}
        {error ? <p className="generation-error" role="alert">{error}</p> : null}
        <div className="footer-actions">
          <button className="link-button" type="button" onClick={onBack}>
            {t("admin.backToManagement")}
          </button>
          <button className="primary-button" type="button" onClick={onCreate} disabled={isCreating || !modelOptions || !values.generatorModel || !values.validatorModel}>
            <Icon icon={Sparkles} />
            {isCreating ? t("admin.generating") : t("admin.create")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function PreviewScreen({
  item,
  onHold,
  onPublish,
  onDelete,
  onBack,
}: PreviewScreenProps) {
  const { t, languageLabel, levelLabel, lengthLabel, topicLabel } = useI18n();
  const held = item.status === "held";

  return (
    <section
      className="screen screen-preview"
      aria-label={t("admin.previewAria")}
      data-reading-language={item.language}
    >
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">{t("admin.generatedDraft")}</p>
            <h1 className="title-jp" lang={item.language}>{item.title}</h1>
            <div className="preview-context">
              <span className={statusClass(item.status)}>
                {itemStatusLabel(item.status, t)}
              </span>
              <span>
                {languageLabel(item.language)} · {levelLabel(item.officialLevel)} · {lengthLabel(item.lengthType)} ·{" "}
                {topicLabel(item.topic)}
              </span>
            </div>
          </div>
        </div>
        <div className="reading-body">
          <div className="passage">
            {item.passage.split(/\r?\n\s*\r?\n/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </div>
          {item.questions.map((question, questionIndex) => (
            <div className="question-block" key={question.id}>
              {item.questions.length > 1 ? <p className="question-number">{t("admin.questionNumber", { number: questionIndex + 1 })}</p> : null}
              <h3>{question.question}</h3>
              <div className="preview-answer-list">
                {question.choices.map((choice, index) => (
                  <div
                    className={`preview-choice${choice.isCorrect ? " is-answer" : ""}`}
                    key={choice.id}
                  >
                    <span className="answer-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{choice.text}</span>
                    {choice.isCorrect ? (
                      <span className="preview-answer-key">
                        <Icon icon={Check} />
                        {t("admin.correct")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="answer-explanation preview-explanation">
                <strong>
                  {t("admin.correctReason", {
                    number: String(question.choices.findIndex((choice) => choice.isCorrect) + 1).padStart(2, "0"),
                  })}
                </strong>
                <span>{question.explanation}</span>
              </div>
            </div>
          ))}
          {held ? <ValidationRecords validations={item.validations} held /> : null}
          <div className="footer-actions preview-actions">
            <div className="preview-actions-secondary">
              {held ? (
                <button className="link-button" type="button" onClick={onBack}>
                  {t("admin.backToManagement")}
                </button>
              ) : null}
              <button
                className="link-button preview-delete"
                type="button"
                onClick={onDelete}
              >
                <Icon icon={Trash2} />
                {t("admin.delete")}
              </button>
            </div>
            <div className="preview-actions-main">
              <button
                className={`text-button${held ? " is-selected" : ""}`}
                type="button"
                aria-pressed={held}
                onClick={onHold}
              >
                <Icon icon={Clock3} />
                {held ? t("admin.cancelHold") : t("admin.hold")}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={onPublish}
              >
                <Icon icon={Upload} />
                {t("admin.publish")}
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
