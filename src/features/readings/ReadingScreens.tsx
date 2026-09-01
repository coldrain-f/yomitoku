import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  MessageSquare,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { ListPagination } from "../../components/ui/ListPagination";
import { LoadingBar } from "../../components/ui/LoadingBar";
import { OptionButtons } from "../../components/ui/OptionButtons";
import {
  difficultyRank,
  formatDate,
  formatTime,
  isNew,
  latestAttempts,
  lengthLabels,
  minimumVotes,
  pageSize,
  perceivedLabel,
} from "../../lib/reading";
import {
  defaultGenerationLanguage,
  languageLabels,
  readingLanguages,
} from "../../lib/readingPolicy";
import type {
  AttemptRecord,
  Choice,
  ListFilters,
  ReadingAttempt,
  ReadingItem,
  ReadingLanguage,
  ReadingResult,
} from "../../types";

interface ReadingListScreenProps {
  items: ReadingItem[];
  loading: boolean;
  authenticated: boolean;
  attempts: AttemptRecord[];
  filters: ListFilters;
  setFilters: (filters: ListFilters) => void;
  query: string;
  setQuery: (query: string) => void;
  onOpenFilters: () => void;
  onStart: (item: ReadingItem) => void;
}

interface ReadingScreenProps {
  item: ReadingItem;
  attempt: ReadingAttempt;
  result: ReadingResult | null;
  onChoose: (choiceId: string) => void;
  onSubmit: () => void;
  onAbandon: () => void;
  onReport: () => void;
  onResult: () => void;
}

interface ResultScreenProps {
  result: ReadingResult | null;
  onFeedback: () => void;
  onContinue: () => void;
  onHome: () => void;
}

export function ReadingListScreen({
  items,
  loading,
  authenticated,
  attempts,
  filters,
  setFilters,
  query,
  setQuery,
  onOpenFilters,
  onStart,
}: ReadingListScreenProps) {
  const [page, setPage] = useState(1);
  const latest = useMemo(() => latestAttempts(attempts), [attempts]);
  const filtered = useMemo(() => {
    const rows = items.filter((item) => {
      const attempt = latest[item.id];
      const learningStatus = attempt?.status ?? item.myLatestStatus ?? "unstarted";
      return (
        item.language === filters.language &&
        (filters.level === "all" || item.officialLevel === filters.level) &&
        (filters.length === "all" || item.lengthType === filters.length) &&
        (!authenticated ||
          filters.status === "all" ||
          learningStatus === filters.status) &&
        item.title
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      );
    });
    const perceived = (item: ReadingItem): number | undefined =>
      item.perceivedVotes >= minimumVotes
        ? difficultyRank[item.perceivedLevel]
        : undefined;

    rows.sort((left, right) => {
      if (filters.sort === "published-asc") {
        return (
          new Date(left.publishedAt ?? left.createdAt).getTime() -
          new Date(right.publishedAt ?? right.createdAt).getTime()
        );
      }
      if (filters.sort === "level-asc") {
        return (
          difficultyRank[left.officialLevel] -
          difficultyRank[right.officialLevel]
        );
      }
      if (filters.sort === "level-desc") {
        return (
          difficultyRank[right.officialLevel] -
          difficultyRank[left.officialLevel]
        );
      }
      if (filters.sort.startsWith("perceived")) {
        const a = perceived(left);
        const b = perceived(right);
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        return filters.sort.endsWith("asc") ? a - b : b - a;
      }
      return (
        new Date(right.publishedAt ?? right.createdAt).getTime() -
        new Date(left.publishedAt ?? left.createdAt).getTime()
      );
    });
    return rows;
  }, [authenticated, filters, items, latest, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const hasAppliedFilters =
    filters.level !== "all" ||
    filters.length !== "all" ||
    filters.sort !== "published-desc" ||
    (authenticated && filters.status !== "all");
  const active =
    query ||
    hasAppliedFilters;
  const reset = () => {
    setQuery("");
    setFilters({
      language: defaultGenerationLanguage,
      level: "all",
      length: "all",
      status: "all",
      sort: "published-desc",
    });
  };

  useEffect(() => setPage(1), [filters, query]);

  return (
    <section className="screen screen-home" aria-label="홈">
      <div className="paper flush">
        <div className="paper-head">
          <div>
            <h1 className="title-jp">読解一覧</h1>
          </div>
          {active ? (
            <p className="list-result-count">{filtered.length}개 결과</p>
          ) : null}
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
        {loading ? <LoadingBar label="목록을 불러오는 중입니다." /> : null}
        <div className="reading-list" aria-busy={loading}>
          {rows.map((item) => {
            const attempt = latest[item.id];
            const status = attempt?.status ?? item.myLatestStatus ?? "unstarted";
            return (
              <button
                className="reading-row"
                type="button"
                key={item.id}
                onClick={() => onStart(item)}
              >
                <span>
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
                </span>
                <span className="row-state">
                  <span
                    className={
                      status === "correct"
                        ? "badge ok row-status"
                        : status === "wrong"
                          ? "badge danger row-status"
                          : "badge row-status"
                    }
                  >
                    {status === "correct"
                      ? "정답"
                      : status === "wrong"
                        ? "오답"
                        : "미풀이"}
                  </span>
                  <time className="row-date">
                    등록 {formatDate(item.publishedAt ?? item.createdAt)}
                  </time>
                </span>
                <Icon icon={ChevronRight} className="row-arrow" />
              </button>
            );
          })}
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="reading-list-empty">
            <p>조건에 맞는 지문이 없습니다.</p>
            <button className="text-button" type="button" onClick={reset}>
              <Icon icon={RotateCcw} />
              필터 초기화
            </button>
          </div>
        ) : (
          <ListPagination
            page={currentPage}
            totalPages={pages}
            onChange={setPage}
          />
        )}
      </div>
    </section>
  );
}

export function ReadingScreen({
  item,
  attempt,
  result,
  onChoose,
  onSubmit,
  onAbandon,
  onReport,
  onResult,
}: ReadingScreenProps) {
  const submitted = Boolean(attempt.submitted && result?.itemId === item.id);
  const selected = attempt.choices.find(
    (choice) => choice.id === attempt.selectedChoiceId,
  );
  const correctNumber = result
    ? String(
        attempt.choices.findIndex(
          (choice) => choice.id === result.correctChoiceId,
        ) + 1,
      ).padStart(2, "0")
    : "";

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
          <div className="passage">
            {item.passage.split("\n\n").map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="question-block">
            <h3>{item.question}</h3>
            <div
              className="answer-list"
              role="radiogroup"
              aria-label="정답 선택"
            >
              {attempt.choices.map((choice, index) => (
                <button
                  className={`answer-choice${choice.id === attempt.selectedChoiceId ? " is-selected" : ""}${submitted && choice.id === result?.correctChoiceId ? " correct" : ""}${submitted && choice.id === attempt.selectedChoiceId && choice.id !== result?.correctChoiceId ? " wrong" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={choice.id === attempt.selectedChoiceId}
                  disabled={submitted}
                  key={choice.id}
                  onClick={() => onChoose(choice.id)}
                >
                  <span className="answer-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{choice.text}</span>
                </button>
              ))}
            </div>
            {!submitted && attempt.message ? (
              <p className="answer-feedback is-visible">{attempt.message}</p>
            ) : null}
            {submitted ? (
              <div className="answer-explanation">
                <strong>{correctNumber}가 정답인 이유</strong>
                <span>{result?.explanation}</span>
                {result && !result.isCorrect && selected ? (
                  <p className="answer-choice-reason">
                    내가 고른{" "}
                    {String(attempt.choices.indexOf(selected) + 1).padStart(
                      2,
                      "0",
                    )}
                    가 오답인 이유: {result.selectedChoiceWrongExplanation ?? "지문 근거와 맞지 않습니다."}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
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
                >
                  <Icon icon={X} />
                  포기하기
                </button>
              ) : null}
              {submitted ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={onResult}
                >
                  다음으로
                  <Icon icon={ArrowRight} />
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={onSubmit}
                >
                  <Icon icon={Check} />
                  제출하기
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
  const { item, choices, selectedChoiceId, isCorrect, elapsedSeconds } = result;
  const selected =
    choices.findIndex((choice) => choice.id === selectedChoiceId) + 1;
  const answer =
    choices.findIndex((choice) => choice.id === result.correctChoiceId) + 1;

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
                내 답 <strong>{String(selected).padStart(2, "0")}</strong>
              </span>
              <span>
                정답 <strong>{String(answer).padStart(2, "0")}</strong>
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
