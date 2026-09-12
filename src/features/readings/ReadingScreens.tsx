import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Star,
  Check,
  ChevronRight,
  Copy,
  Highlighter,
  Info,
  Languages,
  MessageSquare,
  RotateCcw,
  Search,
  SlidersHorizontal,
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
                    <span className="row-title">{item.title}</span>
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
                      {item.officialLevel}
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

interface PendingHighlight {
  startOffset: number;
  endOffset: number;
  selectedText: string;
  left: number;
  top: number;
  placement: "above" | "below" | "bottom";
}

interface HighlightAction {
  highlight: PassageHighlight;
  left: number;
  top: number;
}

function normalizedPassageText(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

async function copyHighlightText(value: string, errorMessage: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error(errorMessage);
}

function PassageHighlighter({
  passage,
  highlights,
  onCreateHighlight,
  onDeleteHighlight,
}: {
  passage: string;
  highlights: PassageHighlight[];
  onCreateHighlight: ReadingScreenProps["onCreateHighlight"];
  onDeleteHighlight: ReadingScreenProps["onDeleteHighlight"];
}) {
  const { t } = useI18n();
  const passageRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const floatingActionRef = useRef<HTMLButtonElement>(null);
  const lastTouchSelectionAtRef = useRef(0);
  const [pending, setPending] = useState<PendingHighlight | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<HighlightAction | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState("");
  const sourceText = normalizedPassageText(passage);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (actionRef.current?.contains(target) ||
          floatingActionRef.current?.contains(target))
      ) {
        return;
      }
      setPending(null);
      setActiveHighlight(null);
    };
    const hideOnViewportChange = () => {
      setPending(null);
      setActiveHighlight(null);
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", hideOnViewportChange, true);
    window.addEventListener("resize", hideOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", hideOnViewportChange, true);
      window.removeEventListener("resize", hideOnViewportChange);
    };
  }, []);

  const captureSelection = (preferMobilePlacement = false) => {
    if (preferMobilePlacement) {
      lastTouchSelectionAtRef.current = Date.now();
    } else if (Date.now() - lastTouchSelectionAtRef.current < 800) {
      return;
    }
    window.setTimeout(() => {
      const root = passageRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPending(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setPending(null);
        return;
      }

      const selectedText = normalizedPassageText(range.toString());
      if (!selectedText.trim()) {
        setPending(null);
        return;
      }
      const beforeSelection = document.createRange();
      beforeSelection.selectNodeContents(root);
      beforeSelection.setEnd(range.startContainer, range.startOffset);
      const startOffset = normalizedPassageText(beforeSelection.toString()).length;
      const endOffset = startOffset + selectedText.length;
      if (sourceText.slice(startOffset, endOffset) !== selectedText) {
        setPending(null);
        return;
      }
      const overlapsExistingHighlight = highlights.some(
        (highlight) =>
          startOffset < highlight.endOffset && highlight.startOffset < endOffset,
      );
      if (overlapsExistingHighlight) {
        setPending(null);
        return;
      }

      const rectangle = range.getBoundingClientRect();
      const left = Math.min(
        Math.max(rectangle.left + rectangle.width / 2, 72),
        window.innerWidth - 72,
      );
      const actionHeight = 34;
      const bottomActionTop = rectangle.bottom + 48;
      const shouldUseBottomAction =
        preferMobilePlacement && bottomActionTop + actionHeight > window.innerHeight - 16;
      setError("");
      setActiveHighlight(null);
      setPending({
        startOffset,
        endOffset,
        selectedText,
        left,
        top: preferMobilePlacement
          ? bottomActionTop
          : Math.max(8, rectangle.top - 42),
        placement: shouldUseBottomAction
          ? "bottom"
          : preferMobilePlacement
            ? "below"
            : "above",
      });
    }, 0);
  };

  const createHighlight = async () => {
    if (!pending || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await onCreateHighlight(
        pending.startOffset,
        pending.endOffset,
        pending.selectedText,
      );
      window.getSelection()?.removeAllRanges();
      setPending(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : t("highlight.saveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openHighlightActions = (highlight: PassageHighlight, target: HTMLElement) => {
    const rectangle = target.getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    setError("");
    setPending(null);
    setActiveHighlight({
      highlight,
      left: Math.min(
        Math.max(rectangle.left + rectangle.width / 2, 90),
        window.innerWidth - 90,
      ),
      top: Math.max(8, rectangle.top - 42),
    });
  };

  const deleteActiveHighlight = async () => {
    if (!activeHighlight || removingId) return;
    setRemovingId(activeHighlight.highlight.id);
    setError("");
    try {
      await onDeleteHighlight(activeHighlight.highlight.id);
      setActiveHighlight(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : t("highlight.deleteFailed"),
      );
    } finally {
      setRemovingId(null);
    }
  };

  const copyActiveHighlight = async () => {
    if (!activeHighlight || isCopying) return;
    setIsCopying(true);
    setError("");
    try {
      await copyHighlightText(activeHighlight.highlight.selectedText, t("highlight.copyFailed"));
      setActiveHighlight(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : t("highlight.copyFailed"),
      );
    } finally {
      setIsCopying(false);
    }
  };

  const content = (() => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    const validHighlights = [...highlights]
      .filter(
        (highlight) =>
          highlight.startOffset >= 0 &&
          highlight.endOffset > highlight.startOffset &&
          sourceText.slice(highlight.startOffset, highlight.endOffset) ===
            highlight.selectedText,
      )
      .sort((left, right) => left.startOffset - right.startOffset);
    for (const highlight of validHighlights) {
      if (highlight.startOffset < cursor) continue;
      if (cursor < highlight.startOffset) {
        nodes.push(sourceText.slice(cursor, highlight.startOffset));
      }
      nodes.push(
        <mark
          className="passage-highlight"
          key={highlight.id}
          role="button"
          tabIndex={0}
          title={t("highlight.tool")}
          aria-label={t("highlight.toolForText", { text: highlight.selectedText })}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openHighlightActions(highlight, event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openHighlightActions(highlight, event.currentTarget);
          }}
        >
          {sourceText.slice(highlight.startOffset, highlight.endOffset)}
        </mark>,
      );
      cursor = highlight.endOffset;
    }
    if (cursor < sourceText.length) nodes.push(sourceText.slice(cursor));
    return nodes;
  })();

  return (
    <>
      <div
        className="passage passage-highlightable"
        ref={passageRef}
        onMouseUp={() => captureSelection()}
        onTouchEnd={() => captureSelection(true)}
        onKeyUp={() => captureSelection()}
      >
        <p>{content}</p>
      </div>
      {pending ? (
        <div
          className={`passage-highlight-action${
            pending.placement === "bottom" ? " passage-highlight-action-bottom" : ""
          }`}
          ref={actionRef}
          style={
            pending.placement === "bottom"
              ? undefined
              : { left: pending.left, top: pending.top }
          }
        >
          <button type="button" onClick={() => void createHighlight()} disabled={isSaving}>
            <Icon icon={Highlighter} />
            {isSaving ? t("highlight.saving") : t("highlight.save")}
          </button>
        </div>
      ) : null}
      <button
        className={`passage-highlight-fab${pending ? " is-ready" : ""}`}
        ref={floatingActionRef}
        type="button"
        aria-label={
          pending
            ? isSaving
              ? t("highlight.savingLabel")
              : t("highlight.selectToSave")
            : t("highlight.selectHint")
        }
        title={
          pending
            ? isSaving
              ? t("highlight.saving")
              : t("highlight.save")
            : t("highlight.select")
        }
        disabled={!pending || isSaving}
        onClick={() => void createHighlight()}
      >
        <Icon icon={Highlighter} />
        <span className="sr-only">
          {isSaving ? t("highlight.saving") : t("highlight.saveShort")}
        </span>
      </button>
      {activeHighlight ? (
        <div
          className="passage-highlight-menu"
          ref={actionRef}
          style={{ left: activeHighlight.left, top: activeHighlight.top }}
          role="group"
          aria-label={t("highlight.tool")}
        >
          <button
            className="passage-highlight-cancel"
            type="button"
            onClick={() => void deleteActiveHighlight()}
            disabled={removingId === activeHighlight.highlight.id}
          >
            <Icon icon={X} />
            {removingId === activeHighlight.highlight.id
              ? t("highlight.deleting")
              : t("highlight.delete")}
          </button>
          <button type="button" onClick={() => void copyActiveHighlight()} disabled={isCopying}>
            <Icon icon={Copy} />
            {isCopying ? t("highlight.copying") : t("highlight.copy")}
          </button>
        </div>
      ) : null}
      {error ? <p className="passage-highlight-error" role="alert">{error}</p> : null}
    </>
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
                level: item.officialLevel,
              })}
              {item.perceivedVotes >= minimumVotes ? (
                <> · {localizedPerceivedLabel(item)}</>
              ) : null}
              {" · "}{lengthLabel(item.lengthType)}
            </p>
            <h1 className="title-jp">{item.title}</h1>
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
        <h1 className="title-jp">{item.title}</h1>
        <div className="result-context">
          <span className="badge">{lengthLabel(item.lengthType)}</span>
          <span>
            {t("reading.actualLevel", {
              language: languageLabel(item.language),
              level: item.officialLevel,
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
