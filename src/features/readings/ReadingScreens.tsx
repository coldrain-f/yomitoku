import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bookmark,
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
  lengthLabels,
  minimumVotes,
  perceivedLabel,
} from "../../lib/reading";
import {
  defaultGenerationLanguage,
  languageLabels,
  readingLanguages,
} from "../../lib/readingPolicy";
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
  onOpenScoreGuide,
  onStart,
  bookmarkingItemIds,
  onToggleBookmark,
}: ReadingListScreenProps) {
  const hasAppliedFilters =
    filters.level !== "all" ||
    filters.length !== "all" ||
    filters.bookmarked ||
    filters.sort !== "published-desc" ||
    (authenticated &&
      (filters.status !== "all" || filters.firstSubmissionTime !== "all"));
  const active =
    query ||
    hasAppliedFilters;
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
    <section className="screen screen-home" aria-label="홈">
      <div className="paper flush">
        <div className="paper-head">
          <div>
            <h1 className="title-jp">読解一覧</h1>
          </div>
          <div className="list-head-actions">
            <button
              className="text-button score-guide-button"
              type="button"
              onClick={onOpenScoreGuide}
            >
              <Icon icon={Info} />
              점수 안내
            </button>
            {active ? (
              <p className="list-result-count">{totalItems}개 결과</p>
            ) : null}
          </div>
        </div>
        <div className="list-toolbar">
          <div className="filter-search">
            <Icon icon={Search} />
            <input
              className="title-search"
              type="search"
              placeholder="제목으로 찾기"
              aria-label="제목 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="list-language-switch">
            <OptionButtons
              value={filters.language}
              options={readingLanguages.map((language) => ({
                value: language,
                label: languageLabels[language],
              }))}
              onChange={(language) =>
                setFilters({
                  ...filters,
                  language: language as ReadingLanguage,
                  level: "all",
                })
              }
              ariaLabel="독해 언어"
            />
          </div>
          <button
            className={`bookmark-filter-button${filters.bookmarked ? " is-active" : ""}`}
            type="button"
            aria-pressed={filters.bookmarked}
            title={
              authenticated
                ? "북마크 문항만 보기"
                : "로그인하면 북마크를 볼 수 있습니다"
            }
            disabled={!authenticated}
            onClick={() =>
              setFilters({ ...filters, bookmarked: !filters.bookmarked })
            }
          >
            <Icon icon={Bookmark} fill={filters.bookmarked ? "currentColor" : "none"} />
            북마크
          </button>
          <button
            className={`icon-button list-filter-button${hasAppliedFilters ? " is-active" : ""}`}
            type="button"
            aria-label="필터 및 정렬"
            aria-pressed={hasAppliedFilters}
            title="필터 및 정렬"
            onClick={onOpenFilters}
          >
            <Icon icon={SlidersHorizontal} />
          </button>
        </div>
        {loading ? <LoadingOverlay label="목록을 불러오는 중입니다." /> : null}
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
                  aria-label={`${item.title} 문항 풀기`}
                  onClick={() => onStart(item)}
                />
                <div className="reading-row-main">
                  <span className="row-title-line">
                    <span className="row-title">{item.title}</span>
                    {isNew(item) ? (
                      <span className="badge row-new">신규</span>
                    ) : null}
                  </span>
                  <span className="row-meta">
                    <span className="badge row-level">
                      {item.officialLevel}
                    </span>
                    {item.perceivedVotes >= minimumVotes ? (
                      <span className="badge row-perceived">
                        {perceivedLabel(item)}
                      </span>
                    ) : null}
                    <span className="badge">
                      {lengthLabels[item.lengthType]}
                    </span>
                    <span className="row-topic">{item.topic}</span>
                  </span>
                </div>
                <span className="row-state">
                  <span className="row-status-line">
                    {item.myFirstSubmissionTimedOut ? (
                      <span
                        className="row-timeout-indicator"
                        role="img"
                        aria-label="첫 제출 시간 초과"
                        title="첫 제출 시간 초과"
                      >
                        <Icon icon={TimerOff} />
                      </span>
                    ) : null}
                    <LearningStatusBadge itemId={item.id} progress={progress} />
                  </span>
                  <time className="row-date">
                    등록 {formatDate(item.publishedAt ?? item.createdAt)} · 정답률{" "}
                    {item.itemAccuracy === null ? "-" : `${Math.round(item.itemAccuracy)}%`}
                  </time>
                </span>
                <button
                  className={`row-bookmark-button${item.isBookmarked ? " is-bookmarked" : ""}`}
                  type="button"
                  aria-label={item.isBookmarked ? `${item.title} 북마크 해제` : `${item.title} 북마크`}
                  aria-pressed={item.isBookmarked}
                  title={
                    authenticated
                      ? item.isBookmarked
                        ? "북마크 해제"
                        : "북마크"
                      : "로그인하면 북마크할 수 있습니다"
                  }
                  disabled={!authenticated || bookmarkingItemIds.has(item.id)}
                  onClick={() => onToggleBookmark(item)}
                >
                  <Icon icon={Bookmark} fill={item.isBookmarked ? "currentColor" : "none"} />
                </button>
                <Icon icon={ChevronRight} className="row-arrow" />
              </div>
            );
          })}
        </div>
        {!loading && items.length === 0 ? (
          <div className="reading-list-empty">
            <p>조건에 맞는 지문이 없습니다.</p>
            <button className="text-button" type="button" onClick={reset}>
              <Icon icon={RotateCcw} />
              필터 초기화
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

function scoreReasonLabel(reason: NonNullable<LearningProgress["reason"]>): string {
  return {
    first_submission_on_time: "첫 제출 시간 내 통과",
    first_submission_timed_out: "첫 제출 시간 초과 통과",
    retry_passed: "오답 후 재시도 통과",
  }[reason];
}

function LearningStatusBadge({
  itemId,
  progress,
}: {
  itemId: string;
  progress: LearningProgress;
}) {
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
        {progress.status === "wrong" ? "오답" : "미풀이"}
      </span>
    );
  }

  const detail = scoreReasonLabel(progress.reason);
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
        aria-label={`${progress.score}점, ${detail}. 상태 사유 보기`}
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

async function copyHighlightText(value: string) {
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
  if (!copied) throw new Error("복사하지 못했습니다.");
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
  const passageRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
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
      if (target instanceof Node && actionRef.current?.contains(target)) {
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
          : "하이라이트를 저장하지 못했습니다.",
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
          : "하이라이트를 삭제하지 못했습니다.",
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
      await copyHighlightText(activeHighlight.highlight.selectedText);
      setActiveHighlight(null);
    } catch (highlightError) {
      setError(
        highlightError instanceof Error
          ? highlightError.message
          : "복사하지 못했습니다.",
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
          title="하이라이트 도구"
          aria-label={`하이라이트 도구: ${highlight.selectedText}`}
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
            {isSaving ? "Saving" : "Highlight"}
          </button>
        </div>
      ) : null}
      {activeHighlight ? (
        <div
          className="passage-highlight-menu"
          ref={actionRef}
          style={{ left: activeHighlight.left, top: activeHighlight.top }}
          role="group"
          aria-label="하이라이트 도구"
        >
          <button
            className="passage-highlight-cancel"
            type="button"
            onClick={() => void deleteActiveHighlight()}
            disabled={removingId === activeHighlight.highlight.id}
          >
            <Icon icon={X} />
            {removingId === activeHighlight.highlight.id ? "Deleting" : "Cancel"}
          </button>
          <button type="button" onClick={() => void copyActiveHighlight()} disabled={isCopying}>
            <Icon icon={Copy} />
            {isCopying ? "Copying" : "Copy"}
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
      aria-label="풀이"
      data-reading-language={item.language}
    >
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">
              {languageLabels[item.language]} · {item.officialLevel} 실제
              {item.perceivedVotes >= minimumVotes ? (
                <> · {perceivedLabel(item)}</>
              ) : null}
              {" · "}{lengthLabels[item.lengthType]}
            </p>
            <h1 className="title-jp">{item.title}</h1>
          </div>
          <div className="reading-meta">
            <div
              className={`time-block${attempt.elapsedSeconds > item.recommendedSeconds ? " is-over" : ""}`}
            >
              <span>권장 {formatTime(item.recommendedSeconds)}</span>
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
                  <p className="question-number">문제 {questionIndex + 1}</p>
                ) : null}
                <h3>{question.question}</h3>
                <div className="answer-list" role="radiogroup" aria-label={`문제 ${questionIndex + 1} 정답 선택`}>
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
                    <strong>{correctNumber}가 정답인 이유</strong>
                    <span lang={explanationLanguage}>{questionResult.explanation}</span>
                    {!questionResult.isCorrect && selected ? (
                      <p className="answer-choice-reason">
                        내가 고른 {String(question.choices.indexOf(selected) + 1).padStart(2, "0")}가 오답인 이유: {" "}
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
              오류 제보
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
                  포기하기
                </button>
              ) : null}
              {submitted ? (
                <>
                  <button className="text-button" type="button" onClick={onTranslate}>
                    <Icon icon={Languages} />
                    번역 보기
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onResult}
                  >
                    다음으로
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
                  {isSubmitting ? "제출 중" : "제출하기"}
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
  onContinue,
  onHome,
}: ResultScreenProps) {
  if (!result) return null;
  const { item, isCorrect, elapsedSeconds } = result;
  const correctCount = result.questionResults.filter((entry) => entry.isCorrect).length;
  const questionCount = result.questionResults.length || 1;

  return (
    <section
      className="screen screen-result"
      aria-label="결과"
      data-reading-language={item.language}
    >
      <div className="paper">
        <p className="kicker">Result</p>
        <h1 className="title-jp">{item.title}</h1>
        <div className="result-context">
          <span className="badge">{lengthLabels[item.lengthType]}</span>
          <span>
            {languageLabels[item.language]} · {item.officialLevel} 실제
            {item.perceivedVotes >= minimumVotes ? (
              <> · {perceivedLabel(item)}</>
            ) : null}
            {" · "}{item.topic}
          </span>
        </div>
        <div className="result-metrics">
          <div className="result-metric">
            <span className="result-label">결과</span>
            <strong
              className={`result-value ${isCorrect ? "is-correct" : "is-wrong"}`}
            >
              {isCorrect ? "정답" : "오답"}
            </strong>
            <span className="result-answer-summary">
              <span>
                정답 <strong>{correctCount} / {questionCount}</strong>
              </span>
            </span>
          </div>
          <div className="result-metric">
            <span className="result-label">권장 시간</span>
            <strong className="result-value">
              {formatTime(item.recommendedSeconds)}
            </strong>
            <span className="result-detail">
              {lengthLabels[item.lengthType]} 기준
            </span>
          </div>
          <div className="result-metric">
            <span className="result-label">풀이 시간</span>
            <strong className="result-value">{formatTime(elapsedSeconds)}</strong>
            <span className="result-detail">
              {elapsedSeconds > item.recommendedSeconds
                ? `${formatTime(elapsedSeconds - item.recommendedSeconds)} 초과`
                : "걸림"}
            </span>
          </div>
          <div className="result-metric">
            <span className="result-label">이 문항의 정답률</span>
            <strong className="result-value result-accuracy">
              {result.itemAccuracy === null ? "-" : `${result.itemAccuracy}% 정답`}
            </strong>
            <span className="result-detail">{result.challengerCount}명 도전</span>
          </div>
        </div>
        <div className="footer-actions">
          <button className="link-button" type="button" onClick={onFeedback}>
            <Icon icon={MessageSquare} />
            문항 평가
          </button>
          <div className="result-actions">
            <button className="text-button" type="button" onClick={onContinue}>
              {isCorrect ? "다음 문항" : "다시 풀기"}
            </button>
            <button className="primary-button" type="button" onClick={onHome}>
              목록으로
              <Icon icon={ArrowRight} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
