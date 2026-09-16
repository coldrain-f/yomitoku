import { useState } from "react";
import {
  ArrowRight,
  Star,
  Check,
  ChevronRight,
  Highlighter,
  Info,
  Languages,
  MessageSquare,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Timer,
  TimerOff,
  X,
} from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { ListPagination } from "../../components/ui/ListPagination";
import { LoadingOverlay } from "../../components/ui/LoadingBar";
import { OptionButtons } from "../../components/ui/OptionButtons";
import {
  formatDate,
  formatTime,
  isNew,
  minimumVotes,
} from "../../lib/reading";
import {
  defaultGenerationLanguage,
  readingLanguages,
} from "../../lib/readingPolicy";
import { useI18n } from "../../lib/i18n";
import { PassageHighlighter } from "./PassageHighlighter";
import type {
  Choice,
  ListFilters,
  LearningProgress,
  ReadingAttempt,
  ReadingItem,
  ReadingLanguage,
  ReadingResult,
  PassageHighlight,
} from "../../types";

interface ReadingListScreenProps {
  items: ReadingItem[];
  loading: boolean;
  error: string;
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  authenticated: boolean;
  filters: ListFilters;
  setFilters: (filters: ListFilters) => void;
  query: string;
  setQuery: (query: string) => void;
  onOpenFilters: () => void;
  onOpenHighlights: () => void;
  onOpenScoreGuide: () => void;
  onStart: (item: ReadingItem) => void;
  bookmarkingItemIds: Set<string>;
  onToggleBookmark: (item: ReadingItem) => void;
}

interface ReadingScreenProps {
  item: ReadingItem;
  attempt: ReadingAttempt;
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
}

interface ResultScreenProps {
  result: ReadingResult | null;
  onFeedback: () => void;
  onReview: () => void;
  onContinue: () => void;
  onHome: () => void;
}

function progressForListItem(item: ReadingItem): LearningProgress {
  if (item.myScore !== null && item.myScoreReason !== null) {
    return { status: "passed", score: item.myScore, reason: item.myScoreReason };
  }
  if (item.myLatestStatus === "wrong") {
    return { status: "wrong", score: null, reason: null };
  }
  return { status: "unstarted", score: null, reason: null };
}

export function ReadingListScreen({
  items,
  loading,
  error,
  page,
  totalPages,
  totalItems,
  onPageChange,
  authenticated,
  filters,
  setFilters,
  query,
  setQuery,
  onOpenFilters,
  onOpenHighlights,
  onOpenScoreGuide,
  onStart,
  bookmarkingItemIds,
  onToggleBookmark,
}: ReadingListScreenProps) {
  const {
    locale,
    t,
    languageLabel,
    levelLabel,
    lengthLabel,
    topicLabel,
    perceivedLabel: localizedPerceivedLabel,
  } = useI18n();
  const hasAdvancedFilters =
    filters.level !== "all" ||
    filters.length !== "all" ||
    filters.sort !== "published-desc" ||
    (authenticated &&
      (filters.status !== "all" || filters.firstSubmissionTime !== "all"));
  const active =
    query ||
    filters.bookmarked ||
    hasAdvancedFilters;
  const reset = () => {
    setQuery("");
    setFilters({
      language: defaultGenerationLanguage,
      bookmarked: false,
      level: "all",
      length: "all",
      status: "all",
      firstSubmissionTime: "all",
      sort: "published-desc",
    });
  };

  return (
    <section className="screen screen-home" aria-label={t("list.home")}>
      <div className="paper flush">
        <div className="paper-head">
          <div>
            <h1 className="title-jp">読解一覧</h1>
          </div>
          <div className="list-head-actions">
            {active ? (
              <p className="list-result-count">{t("list.resultCount", { count: totalItems })}</p>
            ) : null}
            <button
              className="text-button score-guide-button"
              type="button"
              onClick={onOpenScoreGuide}
            >
              <Icon icon={Info} />
              {t("list.scoreGuide")}
            </button>
          </div>
        </div>
        <div className="list-toolbar">
          <div className="filter-search">
            <Icon icon={Search} />
            <input
              className="title-search"
              type="search"
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchLabel")}
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
                setFilters({
                  ...filters,
                  language: language as ReadingLanguage,
                  level: "all",
                })
              }
              ariaLabel={t("list.language")}
            />
          </div>
          <div className="list-toolbar-tools">
            {authenticated ? (
              <button
                className={`icon-button bookmark-filter-button${filters.bookmarked ? " is-bookmarked" : ""}`}
                type="button"
                aria-label={t("list.bookmarkedOnly")}
                aria-pressed={filters.bookmarked}
                title={t("list.bookmarkedOnly")}
                onClick={() =>
                  setFilters({ ...filters, bookmarked: !filters.bookmarked })
                }
              >
                <Icon icon={Star} fill={filters.bookmarked ? "currentColor" : "none"} />
              </button>
            ) : null}
            <button
              className={`icon-button list-filter-button${hasAdvancedFilters ? " is-active" : ""}`}
              type="button"
              aria-label={t("list.filters")}
              aria-pressed={hasAdvancedFilters}
              title={t("list.filters")}
              onClick={onOpenFilters}
            >
              <Icon icon={SlidersHorizontal} />
            </button>
            {authenticated ? (
              <button
                className="icon-button list-highlights-button"
                type="button"
                aria-label={t("list.highlights")}
                title={t("list.highlights")}
                onClick={onOpenHighlights}
              >
                <Icon icon={Highlighter} />
              </button>
            ) : null}
          </div>
        </div>
        {loading ? <LoadingOverlay label={t("list.loading")} /> : null}
        {error ? <p className="list-load-error" role="alert">{error}</p> : null}
        <div className="reading-list" aria-busy={loading}>
          {items.map((item) => {
            const progress = progressForListItem(item);
            return (
              <div
                className="reading-row"
                key={item.id}
              >
                <button
                  className="reading-row-launch"
                  type="button"
                  aria-label={t("list.start", { title: item.title })}
                  onClick={() => onStart(item)}
                />
                <div className="reading-row-main">
                  <span className="row-title-line">
                    <span className="row-title" lang={item.language}>{item.title}</span>
                    {isNew(item) ? (
                      <span className="badge row-new">{t("list.new")}</span>
                    ) : null}
                    {authenticated ? (
                      <button
                        className={`row-bookmark-button${item.isBookmarked ? " is-bookmarked" : ""}`}
                        type="button"
                        aria-label={item.isBookmarked
                          ? t("list.removeBookmark", { title: item.title })
                          : t("list.bookmark", { title: item.title })}
                        aria-pressed={item.isBookmarked}
                        title={item.isBookmarked
                          ? t("list.removeBookmark", { title: item.title })
                          : t("list.bookmark", { title: item.title })}
                        disabled={bookmarkingItemIds.has(item.id)}
                        onClick={() => onToggleBookmark(item)}
                      >
                        <Icon icon={Star} fill={item.isBookmarked ? "currentColor" : "none"} />
                      </button>
                    ) : null}
                  </span>
                  <span className="row-meta">
                    <span className="badge row-level">
                      {levelLabel(item.officialLevel)}
                    </span>
                    {item.perceivedVotes >= minimumVotes ? (
                      <span className="badge row-perceived">
                        {localizedPerceivedLabel(item)}
                      </span>
                    ) : null}
                    <span className="badge">
                      {lengthLabel(item.lengthType)}
                    </span>
                    <span className="row-topic">{topicLabel(item.topic)}</span>
                  </span>
                </div>
                <span className="row-state">
                  <span className="row-status-line">
                    {item.myFirstSubmissionTimedOut ? (
                      <span
                        className="row-timeout-indicator"
                        role="img"
                        aria-label={t("list.firstTimedOut")}
                        title={t("list.firstTimedOut")}
                      >
                        <Icon icon={TimerOff} />
                      </span>
                    ) : null}
                    <LearningStatusBadge itemId={item.id} progress={progress} />
                  </span>
                  <time className="row-date">
                    {formatDate(item.publishedAt ?? item.createdAt, locale)} · {t("list.accuracy")}{" "}
                    {item.itemAccuracy === null ? "-" : `${Math.round(item.itemAccuracy)}%`}
                  </time>
                </span>
                <Icon icon={ChevronRight} className="row-arrow" />
              </div>
            );
          })}
        </div>
        {!loading && items.length === 0 ? (
          <div className="reading-list-empty">
            <p>{t("list.empty")}</p>
            <button className="text-button" type="button" onClick={reset}>
              <Icon icon={RotateCcw} />
              {t("list.resetFilters")}
            </button>
          </div>
        ) : (
          <ListPagination
            page={page}
            totalPages={totalPages}
            onChange={onPageChange}
          />
        )}
      </div>
    </section>
  );
}

function LearningStatusBadge({
  itemId,
  progress,
}: {
  itemId: string;
  progress: LearningProgress;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  if (progress.status !== "passed" || progress.score === null || progress.reason === null) {
    return (
      <span
        className={
          progress.status === "wrong"
            ? "badge danger row-status"
            : "badge row-status"
        }
      >
        {progress.status === "wrong" ? t("progress.wrong") : t("progress.unstarted")}
      </span>
    );
  }

  const detail = t(
    progress.reason === "first_submission_on_time"
      ? "progress.firstOnTime"
      : progress.reason === "first_submission_timed_out"
        ? "progress.firstTimedOut"
        : "progress.retryPassed",
  );
  const tooltipId = `learning-score-${itemId}`;
  return (
    <span className={`row-status-popover${isOpen ? " is-open" : ""}`}>
      <button
        className={`badge ${
          progress.score === 100 ? "ok" : progress.score === 90 ? "warning" : "retry"
        } row-status row-status-button`}
        type="button"
        aria-describedby={tooltipId}
        aria-expanded={isOpen}
        aria-label={t("progress.reason", { score: progress.score, detail })}
        onClick={() => setIsOpen((open) => !open)}
        onBlur={(event) => {
          const target = event.currentTarget;
          window.requestAnimationFrame(() => {
            if (!target.parentElement?.contains(document.activeElement)) setIsOpen(false);
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        <Icon icon={Check} />
        {progress.score}
      </button>
      <span className="row-status-tooltip" id={tooltipId} role="tooltip">
        {detail}
      </span>
    </span>
  );
}

export function ReadingScreen({
  item,
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
}: ReadingScreenProps) {
  const {
    t,
    languageLabel,
    levelLabel,
    lengthLabel,
    perceivedLabel: localizedPerceivedLabel,
  } = useI18n();
  const submitted = Boolean(attempt.submitted && result?.itemId === item.id);
  const questions = attempt.questions.length ? attempt.questions : item.questions;
  const explanationLanguage = item.language === "ja" ? "ko" : "ja";
  const wrongExplanationFallback =
    item.language === "ja"
      ? "지문 근거와 맞지 않습니다."
      : "本文の根拠と合っていません。";

  return (
    <section
      className="screen screen-reading"
      aria-label={t("reading.screen")}
      data-reading-language={item.language}
    >
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">
              {t("reading.actualLevel", {
                language: languageLabel(item.language),
                level: levelLabel(item.officialLevel),
              })}
              {item.perceivedVotes >= minimumVotes ? (
                <> · {localizedPerceivedLabel(item)}</>
              ) : null}
              {" · "}{lengthLabel(item.lengthType)}
            </p>
            <h1 className="title-jp" lang={item.language}>{item.title}</h1>
          </div>
          <div className="reading-meta">
            <div
              className={`time-block${attempt.elapsedSeconds > item.recommendedSeconds ? " is-over" : ""}`}
            >
              <span>{t("reading.recommended", { time: formatTime(item.recommendedSeconds) })}</span>
              <strong>{formatTime(attempt.elapsedSeconds)}</strong>
              <div className="progress-track">
                <span
                  style={{
                    width: `${Math.min(100, (attempt.elapsedSeconds / item.recommendedSeconds) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="reading-body">
          <PassageHighlighter
            passage={item.passage}
            highlights={highlights}
            onCreateHighlight={onCreateHighlight}
            onDeleteHighlight={onDeleteHighlight}
          />
          {questions.map((question, questionIndex) => {
            const selectedChoiceId = attempt.answers.find(
              (answer) => answer.questionId === question.id,
            )?.selectedChoiceId;
            const questionResult = result?.questionResults.find(
              (entry) => entry.questionId === question.id,
            );
            const selected = question.choices.find(
              (choice) => choice.id === selectedChoiceId,
            );
            const correctNumber = questionResult
              ? String(
                  question.choices.findIndex(
                    (choice) => choice.id === questionResult.correctChoiceId,
                  ) + 1,
                ).padStart(2, "0")
              : "";
            return (
              <div className="question-block" key={question.id}>
                {questions.length > 1 ? (
                  <p className="question-number">{t("reading.question", { number: questionIndex + 1 })}</p>
                ) : null}
                <h3>{question.question}</h3>
                <div
                  className="answer-list"
                  role="radiogroup"
                  aria-label={t("reading.answerSelect", { number: questionIndex + 1 })}
                >
                  {question.choices.map((choice, index) => (
                    <button
                      className={`answer-choice${choice.id === selectedChoiceId ? " is-selected" : ""}${submitted && choice.id === questionResult?.correctChoiceId ? " correct" : ""}${submitted && choice.id === selectedChoiceId && choice.id !== questionResult?.correctChoiceId ? " wrong" : ""}`}
                      type="button"
                      role="radio"
                      aria-checked={choice.id === selectedChoiceId}
                      disabled={submitted || isSubmitting}
                      key={choice.id}
                      onClick={() => onChoose(question.id, choice.id)}
                    >
                      <span className="answer-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{choice.text}</span>
                    </button>
                  ))}
                </div>
                {submitted && questionResult ? (
                  <div className="answer-explanation">
                    <strong>{t("reading.correctReason", { number: correctNumber })}</strong>
                    <span lang={explanationLanguage}>{questionResult.explanation}</span>
                    {!questionResult.isCorrect && selected ? (
                      <p className="answer-choice-reason">
                        {t("reading.wrongReason", {
                          number: String(question.choices.indexOf(selected) + 1).padStart(2, "0"),
                        })}{" "}
                        <span lang={explanationLanguage}>
                          {questionResult.selectedChoiceWrongExplanation ?? wrongExplanationFallback}
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!submitted && attempt.message ? (
            <p className="answer-feedback is-visible">{attempt.message}</p>
          ) : null}
          <div className="footer-actions">
            <button className="link-button" type="button" onClick={onReport}>
              <Icon icon={MessageSquare} />
              {t("reading.report")}
            </button>
            <div className="reading-actions">
              {!submitted ? (
                <button
                  className="text-button abandon-reading"
                  type="button"
                  onClick={onAbandon}
                  disabled={isSubmitting}
                >
                  <Icon icon={X} />
                  {t("reading.abandon")}
                </button>
              ) : null}
              {submitted ? (
                <>
                  <button className="text-button" type="button" onClick={onTranslate}>
                    <Icon icon={Languages} />
                    {t("reading.translation")}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onResult}
                  >
                    {t("reading.next")}
                    <Icon icon={ArrowRight} />
                  </button>
                </>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={onSubmit}
                  disabled={isSubmitting}
                >
                  <Icon icon={Check} />
                  {isSubmitting ? t("reading.submitting") : t("reading.submit")}
                </button>
              )}
            </div>
          </div>
        </div>
      </article>
      <div
        className={`reading-time-fab${
          attempt.elapsedSeconds > item.recommendedSeconds ? " is-over" : ""
        }`}
        aria-label={t("reading.timeProgress", {
          elapsed: formatTime(attempt.elapsedSeconds),
          recommended: formatTime(item.recommendedSeconds),
        })}
      >
        <Icon icon={Timer} />
        <strong>{formatTime(attempt.elapsedSeconds)}</strong>
        <span>/ {formatTime(item.recommendedSeconds)}</span>
      </div>
    </section>
  );
}

export function ResultScreen({
  result,
  onFeedback,
  onReview,
  onContinue,
  onHome,
}: ResultScreenProps) {
  const {
    t,
    languageLabel,
    levelLabel,
    lengthLabel,
    topicLabel,
    perceivedLabel: localizedPerceivedLabel,
  } = useI18n();
  if (!result) return null;
  const { item, isCorrect, elapsedSeconds } = result;
  const correctCount = result.questionResults.filter((entry) => entry.isCorrect).length;
  const questionCount = result.questionResults.length || 1;
  const timeDifference = elapsedSeconds - item.recommendedSeconds;
  const timeDetail =
    timeDifference === 0
      ? t("result.onTime")
      : timeDifference > 0
        ? t("result.overTime", { time: formatTime(timeDifference) })
        : t("result.underTime", { time: formatTime(Math.abs(timeDifference)) });

  return (
    <section
      className="screen screen-result"
      aria-label={t("result.screen")}
      data-reading-language={item.language}
    >
      <div className="paper">
        <p className="kicker">{t("result.screen")}</p>
        <h1 className="title-jp" lang={item.language}>{item.title}</h1>
        <div className="result-context">
          <span className="badge">{lengthLabel(item.lengthType)}</span>
          <span>
            {t("reading.actualLevel", {
              language: languageLabel(item.language),
              level: levelLabel(item.officialLevel),
            })}
            {item.perceivedVotes >= minimumVotes ? (
              <> · {localizedPerceivedLabel(item)}</>
            ) : null}
            {" · "}{topicLabel(item.topic)}
          </span>
        </div>
        <div className="result-metrics">
          <div className="result-metric">
            <span className="result-label">{t("result.outcome")}</span>
            <strong
              className={`result-value ${isCorrect ? "is-correct" : "is-wrong"}`}
            >
              {isCorrect ? t("result.correct") : t("result.wrong")}
            </strong>
            {questionCount > 1 ? (
              <div className="result-question-statuses" aria-label={t("result.answerCount")}>
                {result.questionResults.map((questionResult, index) => (
                  <span
                    className={questionResult.isCorrect ? "is-correct" : "is-wrong"}
                    key={questionResult.questionId}
                  >
                    {t("result.questionOutcome", {
                      number: index + 1,
                      outcome: questionResult.isCorrect ? t("result.correct") : t("result.wrong"),
                    })}
                  </span>
                ))}
              </div>
            ) : (
              <span className="result-answer-summary">
                {t("result.answerCount")} <strong>{correctCount} / {questionCount}</strong>
              </span>
            )}
          </div>
          <div className="result-metric">
            <span className="result-label">{t("result.recommendedTime")}</span>
            <strong className="result-value">
              {formatTime(item.recommendedSeconds)}
            </strong>
            <span className="result-detail">
              {t("result.lengthBasis", { length: lengthLabel(item.lengthType) })}
            </span>
          </div>
          <div className="result-metric">
            <span className="result-label">{t("result.elapsedTime")}</span>
            <strong className="result-value">{formatTime(elapsedSeconds)}</strong>
            <span className="result-detail">
              {timeDetail}
            </span>
          </div>
          <div className="result-metric">
            <span className="result-label">{t("result.accuracy")}</span>
            <strong className="result-value result-accuracy">
              {result.itemAccuracy === null
                ? "-"
                : t("result.accuracyValue", { value: result.itemAccuracy })}
            </strong>
            <span className="result-detail">{t("result.challengers", { count: result.challengerCount })}</span>
          </div>
        </div>
        <div className="footer-actions">
          <button className="link-button" type="button" onClick={onFeedback}>
            <Icon icon={MessageSquare} />
            {t("result.feedback")}
          </button>
          <div className="result-actions">
            <button className="text-button" type="button" onClick={onReview}>
              {t("result.review")}
            </button>
            <button className="primary-button" type="button" onClick={onContinue}>
              {isCorrect ? t("result.nextItem") : t("result.retry")}
            </button>
            <button className="text-button" type="button" onClick={onHome}>
              {t("result.toList")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
