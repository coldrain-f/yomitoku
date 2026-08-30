import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  LogIn,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { difficultyRank, initialItems, lengthLabels, topics } from "./data.js";

const pageSize = 10;
const totalGeneratedInitial = 60;
const minimumVotes = 10;
const typeTotals = { short: 20, medium: 22, long: 18 };
const levelTotals = { N5: 10, N4: 12, N3: 13, N2: 15, N1: 10 };

function Icon({ icon: Component, ...props }) {
  return <Component data-lucide="" aria-hidden="true" {...props} />;
}

function formatTime(value = 0) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(new Date(value))
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

function shuffle(values) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function perceivedLabel(item) {
  return item.perceivedVotes >= minimumVotes
    ? `체감 ${item.perceivedLevel}`
    : "체감 집계 중";
}

function statusLabel(status) {
  return { review: "검토 중", held: "보류", published: "게시" }[status];
}

function statusClass(status) {
  return status === "published"
    ? "badge ok"
    : status === "held"
      ? "badge dark"
      : "badge";
}

function isNew(item) {
  return (
    item.publishedAt &&
    Date.now() - new Date(item.publishedAt).getTime() < 72 * 60 * 60 * 1000
  );
}

function latestAttempts(attempts) {
  return attempts.reduce((result, attempt) => {
    if (
      !result[attempt.itemId] ||
      result[attempt.itemId].submittedAt < attempt.submittedAt
    )
      result[attempt.itemId] = attempt;
    return result;
  }, {});
}

function OptionButtons({ value, options, onChange, ariaLabel }) {
  return (
    <div className="choice-group" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const item =
          typeof option === "string"
            ? { value: option, label: option }
            : option;
        return (
          <button
            className={`text-button${value === item.value ? " is-selected" : ""}`}
            type="button"
            aria-pressed={value === item.value}
            key={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Dialog({ dialog, onClose, children }) {
  useEffect(() => {
    if (!dialog) return undefined;
    const scrollbarWidth = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    document.body.style.setProperty(
      "--scrollbar-compensation",
      `${scrollbarWidth}px`,
    );
    document.body.classList.add("dialog-open");
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("dialog-open");
      document.body.style.removeProperty("--scrollbar-compensation");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dialog, onClose]);
  if (!dialog) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.currentTarget === event.target && onClose()}
    >
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="닫기"
          title="닫기"
          onClick={onClose}
        >
          <Icon icon={X} />
        </button>
        <p className="kicker">{dialog.kicker}</p>
        <h2 className="dialog-title" id="dialog-title">
          {dialog.title}
        </h2>
        <p className="body-copy">{dialog.description}</p>
        {children}
        <div className="dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={dialog.onConfirm}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function Breadcrumb({ screen }) {
  const paths = {
    home: ["학습", "독해 목록"],
    stats: ["학습", "독해 목록", "학습 통계"],
    reading: ["학습", "독해 목록", "문제 풀이"],
    result: ["학습", "독해 목록", "풀이 결과"],
    admin: ["관리자", "문항 관리"],
    "admin-edit": ["관리자", "문항 관리", "문항 편집"],
    generate: ["관리자", "문항 관리", "새 독해 지문 생성"],
    preview: ["관리자", "문항 관리", "문항 미리보기"],
  };
  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      {paths[screen].map((label, index, list) => (
        <span
          className={`breadcrumb-item${index === list.length - 1 ? " breadcrumb-current" : ""}`}
          aria-current={index === list.length - 1 ? "page" : undefined}
          key={label}
        >
          {label}
        </span>
      ))}
    </nav>
  );
}

function ListPagination({ page, totalPages, onChange, ariaLabel = "지문 목록 페이지" }) {
  const numbers = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((number) => number > 0 && number <= totalPages)
    .sort((a, b) => a - b);
  return (
    <nav className="list-pagination" aria-label={ariaLabel}>
      <button
        className="pagination-button"
        type="button"
        disabled={page === 1}
        aria-label="이전 페이지"
        onClick={() => onChange(page - 1)}
      >
        <Icon icon={ChevronLeft} />
      </button>
      {numbers.map((number, index) => (
        <span key={number}>
          {index > 0 && number - numbers[index - 1] > 1 ? (
            <span className="pagination-ellipsis">...</span>
          ) : null}
          <button
            className={`pagination-button${number === page ? " is-current" : ""}`}
            type="button"
            aria-current={number === page ? "page" : undefined}
            onClick={() => onChange(number)}
          >
            {number}
          </button>
        </span>
      ))}
      <button
        className="pagination-button"
        type="button"
        disabled={page === totalPages}
        aria-label="다음 페이지"
        onClick={() => onChange(page + 1)}
      >
        <Icon icon={ChevronRight} />
      </button>
    </nav>
  );
}

function ListScreen({
  items,
  authenticated,
  attempts,
  filters,
  setFilters,
  onOpenFilters,
  onStart,
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const latest = useMemo(() => latestAttempts(attempts), [attempts]);
  const filtered = useMemo(() => {
    const rows = items.filter((item) => {
      const attempt = latest[item.id];
      return (
        (filters.level === "all" || item.officialLevel === filters.level) &&
        (filters.length === "all" || item.lengthType === filters.length) &&
        (!authenticated ||
          filters.status === "all" ||
          attempt?.status === filters.status) &&
        item.title
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      );
    });
    const perceived = (item) =>
      item.perceivedVotes >= minimumVotes
        ? difficultyRank[item.perceivedLevel]
        : undefined;
    rows.sort((left, right) => {
      if (filters.sort === "published-asc")
        return new Date(left.publishedAt) - new Date(right.publishedAt);
      if (filters.sort === "level-asc")
        return (
          difficultyRank[left.officialLevel] -
          difficultyRank[right.officialLevel]
        );
      if (filters.sort === "level-desc")
        return (
          difficultyRank[right.officialLevel] -
          difficultyRank[left.officialLevel]
        );
      if (filters.sort.startsWith("perceived")) {
        const a = perceived(left);
        const b = perceived(right);
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        return filters.sort.endsWith("asc") ? a - b : b - a;
      }
      return new Date(right.publishedAt) - new Date(left.publishedAt);
    });
    return rows;
  }, [authenticated, filters, items, latest, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const active =
    query ||
    filters.level !== "all" ||
    filters.length !== "all" ||
    (authenticated && filters.status !== "all");
  const reset = () => {
    setQuery("");
    setFilters({
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
          <button
            className="icon-button list-filter-button"
            type="button"
            aria-label="필터 및 정렬"
            title="필터 및 정렬"
            onClick={onOpenFilters}
          >
            <Icon icon={SlidersHorizontal} />
          </button>
        </div>
        <div className="reading-list">
          {rows.map((item) => {
            const attempt = latest[item.id];
            const status = attempt?.status ?? "unstarted";
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
                    <span
                      className={`badge row-perceived${item.perceivedVotes < minimumVotes ? " is-pending" : ""}`}
                    >
                      {perceivedLabel(item)}
                    </span>
                    <span className="badge">
                      {lengthLabels[item.lengthType]}
                    </span>
                    <span className="row-topic">{item.topic}</span>
                  </span>
                </span>
                <span className="row-state">
                  {authenticated ? (
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
                  ) : null}
                  <time className="row-date">
                    등록 {formatDate(item.publishedAt)}
                  </time>
                </span>
                <Icon icon={ChevronRight} className="row-arrow" />
              </button>
            );
          })}
        </div>
        {filtered.length === 0 ? (
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

function ReadingScreen({
  item,
  attempt,
  result,
  onChoose,
  onSubmit,
  onAbandon,
  onReport,
  onResult,
}) {
  if (!item || !attempt) return null;
  const submitted = attempt.submitted && result?.itemId === item.id;
  const selected = attempt.choices.find(
    (choice) => choice.id === attempt.selectedChoiceId,
  );
  const correct = attempt.choices.find((choice) => choice.isCorrect);
  const correctNumber = String(attempt.choices.indexOf(correct) + 1).padStart(
    2,
    "0",
  );
  const explanation = item.explanation.replace(
    /따라서 \d{2}가/,
    `따라서 ${correctNumber}가`,
  );
  return (
    <section className="screen screen-reading" aria-label="풀이">
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">
              {item.officialLevel} 실제 · {perceivedLabel(item)} ·{" "}
              {lengthLabels[item.lengthType]}
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
                  className={`answer-choice${choice.id === attempt.selectedChoiceId ? " is-selected" : ""}${submitted && choice.isCorrect ? " correct" : ""}${submitted && choice.id === attempt.selectedChoiceId && !choice.isCorrect ? " wrong" : ""}`}
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
                <strong>
                  {correctNumber}가 정답인 이유
                </strong>
                <span>{explanation}</span>
                {!result.isCorrect ? (
                  <p className="answer-choice-reason">
                    내가 고른{" "}
                    {String(attempt.choices.indexOf(selected) + 1).padStart(
                      2,
                      "0",
                    )}
                    가 오답인 이유: {selected.wrongExplanation}
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

function ResultScreen({ result, onFeedback, onContinue, onHome }) {
  if (!result) return null;
  const { item, choices, selectedChoiceId, isCorrect, elapsedSeconds } = result;
  const selected =
    choices.findIndex((choice) => choice.id === selectedChoiceId) + 1;
  const answer = choices.findIndex((choice) => choice.isCorrect) + 1;
  const record = {
    society: [62, 42],
    shopping: [71, 38],
    cooking: [58, 14],
    library: [75, 17],
    "quiet-library": [67, 11],
  }[item.id] ?? [0, 0];
  return (
    <section className="screen screen-result" aria-label="결과">
      <div className="paper">
        <p className="kicker">Result</p>
        <h1 className="title-jp">{item.title}</h1>
        <div className="result-context">
          <span className="badge">{lengthLabels[item.lengthType]}</span>
          <span>
            {item.officialLevel} 실제 · {perceivedLabel(item)} · {item.topic}
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
            <strong className="result-value">
              {formatTime(elapsedSeconds)}
            </strong>
            <span className="result-detail">
              {elapsedSeconds > item.recommendedSeconds
                ? `${formatTime(elapsedSeconds - item.recommendedSeconds)} 초과`
                : "걸림"}
            </span>
          </div>
          <div className="result-metric">
            <span className="result-label">이 문항의 정답률</span>
            <strong className="result-value result-accuracy">
              {record[0]}% 정답
            </strong>
            <span className="result-detail">{record[1]}명 도전</span>
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

function StatsScreen({ attempts }) {
  const latest = latestAttempts(attempts);
  const records = Object.values(latest);
  const correctRate = records.length
    ? Math.round(
        (records.filter((record) => record.isCorrect).length / records.length) *
          100,
      )
    : 0;
  const average = records.length
    ? Math.round(
        records.reduce((sum, record) => sum + record.elapsedSeconds, 0) /
          records.length,
      )
    : 0;
  const bar = (label, total, entries) => {
    const rate = entries.length
      ? Math.round(
          (entries.filter((entry) => entry.isCorrect).length / entries.length) *
            100,
        )
      : null;
    const time = entries.length
      ? Math.round(
          entries.reduce((sum, entry) => sum + entry.elapsedSeconds, 0) /
            entries.length,
        )
      : null;
    return (
      <article
        className={`stats-bar-row${entries.length ? "" : " is-empty"}`}
        key={label}
      >
        <div className="stats-bar-topline">
          <strong>{label}</strong>
          <span className="stats-bar-count">
            {entries.length} / {total} 완료
          </span>
        </div>
        <div className="stats-bar-track">
          <span
            className="stats-bar-fill"
            style={{ "--progress": `${(entries.length / total) * 100}%` }}
          />
        </div>
        <p className="stats-bar-meta">
          <span>
            정답률 <strong>{rate === null ? "-" : `${rate}%`}</strong>
          </span>
          <span>평균 {time === null ? "-" : formatTime(time)}</span>
        </p>
      </article>
    );
  };
  return (
    <section className="screen screen-stats" aria-label="학습 통계">
      <div className="paper">
        <div className="stats-heading">
          <div>
            <p className="kicker">Learning record</p>
            <h1 className="screen-title">학습 통계</h1>
          </div>
          <span className="badge">생성된 문제 60개</span>
        </div>
        <div className="stats-overview">
          <div className="stats-overview-item">
            <span className="stats-label">풀이 완료</span>
            <strong className="stats-value">{records.length} / 60</strong>
            <span className="stats-detail">1회 이상 제출한 고유 문항</span>
          </div>
          <div className="stats-overview-item">
            <span className="stats-label">전체 정답률</span>
            <strong className="stats-value">
              {records.length ? `${correctRate}%` : "-"}
            </strong>
            <span className="stats-detail">문항별 최근 제출 기준</span>
          </div>
          <div className="stats-overview-item">
            <span className="stats-label">평균 풀이 시간</span>
            <strong className="stats-value">
              {records.length ? formatTime(average) : "-"}
            </strong>
            <span className="stats-detail">문항별 최근 제출 기준</span>
          </div>
        </div>
        <p className="stats-aggregation-note">
          진도는 한 번 이상 제출한 고유 문항 수로, 정답률과 풀이 시간은 문항별
          최근 제출 결과로 계산합니다.
        </p>
        <section className="stats-section stats-progress-section">
          <div className="stats-section-heading">
            <h2 className="stats-section-title">학습 진도</h2>
            <span className="stats-section-note">
              미풀이 {60 - records.length}문항
            </span>
          </div>
          <div className="stats-progress-track">
            <span
              className="stats-progress-fill"
              style={{ "--progress": `${(records.length / 60) * 100}%` }}
            />
          </div>
        </section>
        <section className="stats-section">
          <div className="stats-section-heading">
            <h2 className="stats-section-title">유형별 풀이 현황</h2>
            <span className="stats-section-note">생성된 문제 기준</span>
          </div>
          <div className="stats-bar-list">
            {Object.entries(typeTotals).map(([type, total]) =>
              bar(
                lengthLabels[type],
                total,
                records.filter((record) => record.lengthType === type),
              ),
            )}
          </div>
        </section>
        <section className="stats-section">
          <div className="stats-section-heading">
            <h2 className="stats-section-title">난이도별 풀이 현황</h2>
            <span className="stats-section-note">생성된 문제 기준</span>
          </div>
          <div className="stats-bar-list">
            {Object.entries(levelTotals).map(([level, total]) =>
              bar(
                level,
                total,
                records.filter((record) => record.officialLevel === level),
              ),
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function AdminScreen({ items, filters, onFilters, onEdit, onGenerate }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (filters.level === "all" || filters.level === item.officialLevel) &&
            (filters.length === "all" || filters.length === item.lengthType) &&
            (filters.topic === "all" || filters.topic === item.topic) &&
            (filters.status === "all" || filters.status === item.status) &&
            item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .sort((left, right) => {
          if (filters.sort === "created-desc")
            return new Date(right.createdAt) - new Date(left.createdAt);
          if (filters.sort === "created-asc")
            return new Date(left.createdAt) - new Date(right.createdAt);
          if (filters.sort === "updated-asc")
            return new Date(left.updatedAt) - new Date(right.updatedAt);
          if (filters.sort === "title-asc")
            return left.title.localeCompare(right.title, "ja");
          if (filters.sort === "level-asc")
            return (
              difficultyRank[left.officialLevel] -
              difficultyRank[right.officialLevel]
            );
          if (filters.sort === "level-desc")
            return (
              difficultyRank[right.officialLevel] -
              difficultyRank[left.officialLevel]
            );
          if (filters.sort === "perceived-asc")
            return (
              difficultyRank[left.perceivedLevel] -
              difficultyRank[right.perceivedLevel]
            );
          if (filters.sort === "perceived-desc")
            return (
              difficultyRank[right.perceivedLevel] -
              difficultyRank[left.perceivedLevel]
            );
          if (filters.sort === "status-asc")
            return (
              ["review", "held", "published"].indexOf(left.status) -
              ["review", "held", "published"].indexOf(right.status)
            );
          return new Date(right.updatedAt) - new Date(left.updatedAt);
        }),
    [filters, items, query],
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => setPage(1), [filters, query]);

  return (
    <section className="screen screen-admin" aria-label="관리자 문항 관리">
      <div className="paper flush">
        <div className="paper-head admin-paper-head">
          <div>
            <p className="kicker">Administrator</p>
            <h1 className="screen-title">문항 관리</h1>
          </div>
          <div className="admin-head-actions">
            <span className="badge dark">관리자</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="filter-search">
            <Icon icon={Search} />
            <input
              className="title-search"
              type="search"
              placeholder="제목으로 찾기"
              aria-label="관리 문항 제목 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            className="icon-button list-filter-button"
            type="button"
            aria-label="필터 및 정렬"
            title="필터 및 정렬"
            onClick={onFilters}
          >
            <Icon icon={SlidersHorizontal} />
          </button>
        </div>
        <div className="admin-list">
          {pageRows.map((item) => (
            <button
              className="admin-row"
              type="button"
              key={item.id}
              onClick={() => onEdit(item)}
            >
              <span>
                <span className="admin-row-title">{item.title}</span>
                <span className="row-meta">
                  <span className="badge row-level">{item.officialLevel}</span>
                  <span className="badge row-perceived">
                    {perceivedLabel(item)} · {item.perceivedVotes}명
                  </span>
                  <span className="badge">{lengthLabels[item.lengthType]}</span>
                  <span className="row-topic">{item.topic}</span>
                </span>
              </span>
              <span className="admin-row-state">
                <span className={statusClass(item.status)}>
                  {statusLabel(item.status)}
                </span>
                <time className="row-date">
                  등록 {formatDate(item.createdAt)}
                </time>
                <time className="row-date">
                  수정 {formatDate(item.updatedAt)}
                </time>
              </span>
              <Icon icon={Pencil} />
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="reading-list-empty">
            <p>조건에 맞는 문항이 없습니다.</p>
          </div>
        ) : (
          <ListPagination
            page={currentPage}
            totalPages={pages}
            onChange={setPage}
            ariaLabel="관리 문항 목록 페이지"
          />
        )}
        <div className="home-actions">
          <button className="primary-button" type="button" onClick={onGenerate}>
            <Icon icon={Plus} />새 독해 지문 생성
          </button>
        </div>
      </div>
    </section>
  );
}

function AdminEdit({
  item,
  draft,
  setDraft,
  onSave,
  onHold,
  onPublish,
  onDelete,
  onBack,
}) {
  if (!item || !draft) return null;
  const updateChoice = (index, text) =>
    setDraft({
      ...draft,
      choices: draft.choices.map((choice, choiceIndex) =>
        choiceIndex === index ? { ...choice, text } : choice,
      ),
    });
  return (
    <section className="screen screen-admin-edit" aria-label="관리자 문항 편집">
      <div className="paper">
        <div className="admin-edit-heading">
          <div>
            <p className="kicker">Content management</p>
            <h1 className="screen-title">문항 편집</h1>
          </div>
          <span className={statusClass(item.status)}>
            {statusLabel(item.status)}
          </span>
        </div>
        <div className="admin-edit-form">
          <label className="admin-field admin-field-wide">
            <span className="form-label">제목</span>
            <input
              className="input-field"
              type="text"
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <div className="admin-metadata-grid">
            <label className="admin-field">
              <span className="form-label">난이도</span>
              <select
                className="select-field"
                value={draft.officialLevel}
                onChange={(event) =>
                  setDraft({ ...draft, officialLevel: event.target.value })
                }
              >
                {["N5", "N4", "N3", "N2", "N1"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className="admin-field admin-summary-field">
              <span className="form-label">체감 난이도</span>
              <div className="admin-summary-value">
                <strong>{perceivedLabel(item)}</strong>
                <span>
                  응답 {item.perceivedVotes}명 ·{" "}
                  {item.perceivedVotes >= minimumVotes ? "공개" : "비공개"}
                </span>
              </div>
            </div>
            <label className="admin-field">
              <span className="form-label">유형</span>
              <select
                className="select-field"
                value={draft.lengthType}
                onChange={(event) =>
                  setDraft({ ...draft, lengthType: event.target.value })
                }
              >
                {Object.entries(lengthLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="form-label">주제</span>
              <select
                className="select-field"
                value={draft.topic}
                onChange={(event) =>
                  setDraft({ ...draft, topic: event.target.value })
                }
              >
                {topics.map((topic) => (
                  <option key={topic}>{topic}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="admin-field admin-field-wide">
            <span className="form-label">지문</span>
            <textarea
              className="admin-textarea"
              value={draft.passage}
              onChange={(event) =>
                setDraft({ ...draft, passage: event.target.value })
              }
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span className="form-label">문제</span>
            <textarea
              className="admin-textarea admin-question-textarea"
              value={draft.question}
              onChange={(event) =>
                setDraft({ ...draft, question: event.target.value })
              }
            />
          </label>
          <section className="admin-options-section">
            <div className="admin-options-heading">
              <span className="form-label">선택지</span>
              <label className="admin-answer-select">
                정답{" "}
                <select
                  className="select-field"
                  value={draft.choices.findIndex((choice) => choice.isCorrect)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      choices: draft.choices.map((choice, index) => ({
                        ...choice,
                        isCorrect: index === Number(event.target.value),
                      })),
                    })
                  }
                >
                  {draft.choices.map((choice, index) => (
                    <option value={index} key={choice.id}>
                      {String(index + 1).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-options-list">
              {draft.choices.map((choice, index) => (
                <label className="admin-option" key={choice.id}>
                  <span className="answer-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <input
                    className="input-field"
                    type="text"
                    value={choice.text}
                    onChange={(event) =>
                      updateChoice(index, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </section>
          <label className="admin-field admin-field-wide">
            <span className="form-label">해설</span>
            <textarea
              className="admin-textarea admin-explanation-textarea"
              value={draft.explanation}
              onChange={(event) =>
                setDraft({ ...draft, explanation: event.target.value })
              }
            />
          </label>
          <section className="admin-insights">
            <div className="admin-section-heading">
              <h2 className="admin-section-title">문항 반응</h2>
              <span className="admin-section-note">
                평가 {item.perceivedVotes}명
              </span>
            </div>
            <dl className="admin-insight-list">
              <div>
                <dt>문항 평가</dt>
                <dd>{item.quality ? `${item.quality} / 5` : "평가 없음"}</dd>
              </div>
              <div>
                <dt>체감 난이도</dt>
                <dd>
                  {item.perceivedVotes >= minimumVotes
                    ? `${item.perceivedLevel} · ${item.perceivedVotes}명`
                    : `집계 중 · ${item.perceivedVotes}명`}
                </dd>
              </div>
              <div>
                <dt>오류 제보</dt>
                <dd>{item.reportCount}건</dd>
              </div>
            </dl>
            <div className="admin-latest-report">
              <span className="form-label">최근 오류 제보</span>
              <p>{item.latestReport}</p>
              <time className="row-date">{formatDate(item.updatedAt)}</time>
            </div>
          </section>
          <section className="admin-validation">
            <div className="admin-section-heading">
              <h2 className="admin-section-title">생성 검증</h2>
              <span
                className={
                  item.validation.status === "passed"
                    ? "badge ok"
                    : "badge danger"
                }
              >
                {item.validation.status === "passed"
                  ? "검증 통과"
                  : "검증 확인"}
              </span>
            </div>
            <dl className="admin-validation-list">
              <div>
                <dt>정답 검증</dt>
                <dd>{item.validation.answer}</dd>
              </div>
              <div>
                <dt>오답 설계</dt>
                <dd>{item.validation.distractor}</dd>
              </div>
              <div>
                <dt>해설 논리</dt>
                <dd>{item.validation.explanation}</dd>
              </div>
            </dl>
          </section>
        </div>
        <div className="footer-actions admin-edit-actions">
          <div className="admin-edit-secondary">
            <button className="link-button" type="button" onClick={onBack}>
              관리 목록으로
            </button>
            <button
              className="link-button preview-delete"
              type="button"
              onClick={onDelete}
            >
              <Icon icon={Trash2} />
              삭제
            </button>
          </div>
          <div className="admin-edit-main">
            <button className="text-button" type="button" onClick={onHold}>
              <Icon icon={Clock3} />
              {item.status === "held"
                ? "보류 취소"
                : item.status === "published"
                  ? "보류로 전환"
                  : "보류"}
            </button>
            {item.status !== "published" ? (
              <button className="text-button" type="button" onClick={onPublish}>
                <Icon icon={Upload} />
                게시하기
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={onSave}>
              <Icon icon={Save} />
              저장하기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function GenerateScreen({ values, setValues, onCreate, onBack }) {
  return (
    <section className="screen screen-generate" aria-label="지문 생성">
      <div className="paper">
        <p className="kicker">Generate</p>
        <h1 className="screen-title">새 독해 지문 생성</h1>
        <div className="form-grid">
          <div className="form-section">
            <span className="form-label">난이도</span>
            <OptionButtons
              value={values.level}
              options={["N5", "N4", "N3", "N2", "N1"]}
              onChange={(level) => setValues({ ...values, level })}
              ariaLabel="난이도"
            />
          </div>
          <div className="form-section">
            <span className="form-label">유형</span>
            <OptionButtons
              value={values.length}
              options={Object.entries(lengthLabels).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(length) => setValues({ ...values, length })}
              ariaLabel="유형"
            />
          </div>
          <div className="form-section">
            <div className="generate-topic-field">
              <span className="form-label">주제</span>
              <select
                className="select-field"
                value={values.topic}
                onChange={(event) =>
                  setValues({ ...values, topic: event.target.value })
                }
              >
                <option value="추천">추천 (랜덤)</option>
                {topics.map((topic) => (
                  <option key={topic}>{topic}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="furigana-row">
          <span className="form-label">후리가나</span>
          <OptionButtons
            value="off"
            options={[
              { value: "off", label: "미표기" },
              { value: "on", label: "표기", disabled: true },
            ]}
            onChange={() => {}}
            ariaLabel="후리가나"
          />
        </div>
        <div className="footer-actions">
          <button className="link-button" type="button" onClick={onBack}>
            관리 목록으로
          </button>
          <button className="primary-button" type="button" onClick={onCreate}>
            <Icon icon={Sparkles} />
            지문 만들기
          </button>
        </div>
      </div>
    </section>
  );
}

function PreviewScreen({ item, onHold, onPublish, onDelete, onBack }) {
  if (!item) return null;
  const held = item.status === "held";
  return (
    <section className="screen screen-preview" aria-label="생성된 문항 검토">
      <article className="paper flush">
        <div className="paper-head">
          <div>
            <p className="kicker">Generated draft</p>
            <h1 className="title-jp">{item.title}</h1>
            <div className="preview-context">
              <span className={statusClass(item.status)}>
                {statusLabel(item.status)}
              </span>
              <span>
                {item.officialLevel} · {lengthLabels[item.lengthType]} ·{" "}
                {item.topic}
              </span>
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
            <div className="preview-answer-list">
              {item.choices.map((choice, index) => (
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
                      정답
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="answer-explanation preview-explanation">
              <strong>
                {String(
                  item.choices.findIndex((choice) => choice.isCorrect) + 1,
                ).padStart(2, "0")}
                이 정답인 이유
              </strong>
              <span>{item.explanation}</span>
            </div>
          </div>
          <div className="footer-actions preview-actions">
            <div className="preview-actions-secondary">
              {held ? (
                <button className="link-button" type="button" onClick={onBack}>
                  관리 목록으로
                </button>
              ) : null}
              <button
                className="link-button preview-delete"
                type="button"
                onClick={onDelete}
              >
                <Icon icon={Trash2} />
                삭제
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
                {held ? "보류 취소" : "보류"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={held}
                onClick={onPublish}
              >
                <Icon icon={Upload} />
                게시하기
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [authenticated, setAuthenticated] = useState(true);
  const [role, setRole] = useState("admin");
  const [items, setItems] = useState(initialItems);
  const [totalGenerated, setTotalGenerated] = useState(totalGeneratedInitial);
  const [attempts, setAttempts] = useState([
    {
      itemId: "society",
      status: "correct",
      isCorrect: true,
      elapsedSeconds: 228,
      submittedAt: "2026-08-29T02:00:00Z",
      lengthType: "long",
      officialLevel: "N3",
    },
    {
      itemId: "shopping",
      status: "wrong",
      isCorrect: false,
      elapsedSeconds: 182,
      submittedAt: "2026-08-28T04:00:00Z",
      lengthType: "short",
      officialLevel: "N2",
    },
    {
      itemId: "cooking",
      status: "correct",
      isCorrect: true,
      elapsedSeconds: 166,
      submittedAt: "2026-08-20T04:00:00Z",
      lengthType: "medium",
      officialLevel: "N2",
    },
  ]);
  const [filters, setFilters] = useState({
    level: "all",
    length: "all",
    status: "all",
    sort: "published-desc",
  });
  const [adminFilters, setAdminFilters] = useState({
    level: "all",
    length: "all",
    topic: "all",
    status: "all",
    sort: "updated-desc",
  });
  const [filterDraft, setFilterDraft] = useState(filters);
  const [adminFilterDraft, setAdminFilterDraft] = useState(adminFilters);
  const filterDraftRef = useRef(filterDraft);
  const adminFilterDraftRef = useRef(adminFilterDraft);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [generation, setGeneration] = useState({
    level: "N2",
    length: "medium",
    topic: "추천",
  });
  const [previewId, setPreviewId] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const [reportText, setReportText] = useState("");
  const [feedback, setFeedback] = useState({
    quality: "",
    level: "",
    comment: "",
  });

  const activeItem = items.find((item) => item.id === activeId);
  const editingItem = items.find((item) => item.id === editingId);
  const previewItem = items.find((item) => item.id === previewId);
  const publishedItems = items.filter((item) => item.status === "published");
  const completeCount = Object.keys(latestAttempts(attempts)).length;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    filterDraftRef.current = filterDraft;
  }, [filterDraft]);
  useEffect(() => {
    adminFilterDraftRef.current = adminFilterDraft;
  }, [adminFilterDraft]);
  useEffect(() => {
    if (screen !== "reading" || !attempt || attempt.submitted) return undefined;
    const tick = () =>
      setAttempt((current) =>
        current
          ? {
              ...current,
              elapsedSeconds: Math.floor(
                (Date.now() - current.startedAt) / 1000,
              ),
            }
          : current,
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.startedAt, attempt?.submitted, screen]);

  const closeDialog = () => {
    setDialog(null);
    setDialogError("");
  };
  const openDialog = (value) => {
    setDialogError("");
    setDialog(value);
  };
  const updateItem = (id, next) =>
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, ...next, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  const start = (item) => {
    const existing = latestAttempts(attempts)[item.id];
    if (!authenticated) {
      openDialog({
        kicker: "Sign in",
        title: "로그인할까요?",
        description: "로그인하면 풀이 결과와 학습 통계를 기록할 수 있습니다.",
        confirmLabel: "로그인하기",
        onConfirm: () => {
          closeDialog();
          setAuthenticated(true);
          setRole("admin");
          window.setTimeout(() => start(item), 0);
        },
      });
      return;
    }
    openDialog({
      kicker: "Start reading",
      title:
        existing?.status === "wrong"
          ? "오답 문항을 다시 풀까요?"
          : existing?.status === "correct"
            ? "문항을 다시 풀까요?"
            : "독해를 시작할까요?",
      description: existing
        ? "새 답안과 풀이 시간을 기록합니다."
        : "문제를 열면 풀이 시간이 시작됩니다.",
      confirmLabel: existing ? "다시 풀기" : "시작하기",
      onConfirm: () => {
        closeDialog();
        setActiveId(item.id);
        setResult(null);
        setAttempt({
          startedAt: Date.now(),
          elapsedSeconds: 0,
          selectedChoiceId: null,
          choices: shuffle(item.choices),
          submitted: false,
          message: "",
        });
        setScreen("reading");
      },
    });
  };
  const goHome = () => {
    if (screen === "home") return;
    if (screen === "reading" && attempt && !attempt.submitted) {
      openDialog({
        kicker: "Leave reading",
        title: "풀이를 포기할까요?",
        description:
          "현재 답안과 풀이 시간은 저장되지 않고 목록으로 돌아갑니다.",
        confirmLabel: "포기하기",
        onConfirm: () => {
          closeDialog();
          setAttempt(null);
          setScreen("home");
          setToast("풀이를 포기하고 목록으로 돌아왔습니다.");
        },
      });
      return;
    }
    openDialog({
      kicker: "Back to list",
      title: "목록으로 돌아갈까요?",
      description: "현재 화면을 닫고 독해 목록으로 돌아갑니다.",
      confirmLabel: "목록으로",
      onConfirm: () => {
        closeDialog();
        setScreen("home");
      },
    });
  };
  const submit = () => {
    if (!attempt.selectedChoiceId) {
      setAttempt({
        ...attempt,
        message: "선택지를 하나 고른 뒤 제출할 수 있습니다.",
      });
      return;
    }
    openDialog({
      kicker: "Submit answer",
      title: "답안을 제출할까요?",
      description:
        "제출하면 이 화면에서 정답과 선택지 해설을 확인할 수 있습니다.",
      confirmLabel: "제출하기",
      onConfirm: () => {
        const selected = attempt.choices.find(
          (choice) => choice.id === attempt.selectedChoiceId,
        );
        const submitted = {
          itemId: activeItem.id,
          item: activeItem,
          choices: attempt.choices,
          selectedChoiceId: selected.id,
          isCorrect: Boolean(selected.isCorrect),
          elapsedSeconds: attempt.elapsedSeconds,
        };
        closeDialog();
        setResult(submitted);
        setAttempt({ ...attempt, submitted: true });
        setAttempts((current) => [
          ...current,
          {
            itemId: activeItem.id,
            status: selected.isCorrect ? "correct" : "wrong",
            isCorrect: Boolean(selected.isCorrect),
            elapsedSeconds: attempt.elapsedSeconds,
            submittedAt: new Date().toISOString(),
            lengthType: activeItem.lengthType,
            officialLevel: activeItem.officialLevel,
          },
        ]);
      },
    });
  };
  const deleteItem = (item, target = "admin") =>
    openDialog({
      kicker: "Delete item",
      title: "문항을 삭제할까요?",
      description:
        "문항과 연결된 기록을 영구 삭제합니다. 삭제한 문항은 복구할 수 없습니다.",
      confirmLabel: "삭제하기",
      onConfirm: () => {
        closeDialog();
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        setAttempts((current) =>
          current.filter((entry) => entry.itemId !== item.id),
        );
        setTotalGenerated((current) => current - 1);
        setScreen(target);
        setToast("문항을 삭제했습니다.");
      },
    });
  const createDraft = () =>
    openDialog({
      kicker: "Generate reading",
      title: "새 독해 지문을 만들까요?",
      description:
        "선택한 조건으로 지문과 문항을 만든 뒤 검토 화면으로 이동합니다.",
      confirmLabel: "지문 만들기",
      onConfirm: () => {
        const base = structuredClone(
          items.find((item) => item.id === "library") ?? items[0],
        );
        const id = `generated-${Date.now()}`;
        const now = new Date().toISOString();
        const topic = generation.topic === "추천" ? "교육" : generation.topic;
        const newItem = {
          ...base,
          id,
          title: `${topic}를 읽는 방법`,
          status: "review",
          officialLevel: generation.level,
          lengthType: generation.length,
          topic,
          recommendedSeconds: { short: 60, medium: 150, long: 270 }[
            generation.length
          ],
          perceivedLevel: generation.level,
          perceivedVotes: 0,
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
          quality: 0,
          reportCount: 0,
          latestReport: "접수된 오류 제보가 없습니다.",
          choices: base.choices.map((choice, index) => ({
            ...choice,
            id: `${id}-${index + 1}`,
          })),
        };
        closeDialog();
        setItems((current) => [...current, newItem]);
        setTotalGenerated((current) => current + 1);
        setPreviewId(id);
        setScreen("preview");
      },
    });
  const filterDialog = (
    <div className="dialog-filter-field">
      <div className="dialog-filter-section">
        <span className="form-label">난이도</span>
        <OptionButtons
          value={filterDraft.level}
          options={[
            { value: "all", label: "전체" },
            "N5",
            "N4",
            "N3",
            "N2",
            "N1",
          ]}
          onChange={(level) => setFilterDraft({ ...filterDraft, level })}
          ariaLabel="난이도 필터"
        />
      </div>
      <div className="dialog-filter-section">
        <span className="form-label">유형</span>
        <OptionButtons
          value={filterDraft.length}
          options={[
            { value: "all", label: "전체" },
            ...Object.entries(lengthLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
          onChange={(length) => setFilterDraft({ ...filterDraft, length })}
          ariaLabel="유형 필터"
        />
      </div>
      {authenticated ? (
        <div className="dialog-filter-section">
          <span className="form-label">풀이 상태</span>
          <OptionButtons
            value={filterDraft.status}
            options={[
              { value: "all", label: "전체" },
              { value: "unstarted", label: "미풀이" },
              { value: "wrong", label: "오답" },
              { value: "correct", label: "정답" },
            ]}
            onChange={(status) => setFilterDraft({ ...filterDraft, status })}
            ariaLabel="풀이 상태 필터"
          />
        </div>
      ) : null}
      <label className="dialog-filter-section">
        <span className="form-label">정렬</span>
        <select
          className="select-field"
          value={filterDraft.sort}
          onChange={(event) =>
            setFilterDraft({ ...filterDraft, sort: event.target.value })
          }
        >
          <option value="published-desc">등록일 최신순</option>
          <option value="published-asc">등록일 오래된순</option>
          <option value="level-asc">난이도 낮은순</option>
          <option value="level-desc">난이도 높은순</option>
          <option value="perceived-asc">체감 난이도 낮은순</option>
          <option value="perceived-desc">체감 난이도 높은순</option>
        </select>
      </label>
    </div>
  );
  const adminFilterDialog = (
    <div className="dialog-admin-filter-field">
      <div className="dialog-filter-section">
        <span className="form-label">난이도</span>
        <OptionButtons
          value={adminFilterDraft.level}
          options={[
            { value: "all", label: "전체" },
            "N5",
            "N4",
            "N3",
            "N2",
            "N1",
          ]}
          onChange={(level) =>
            setAdminFilterDraft({ ...adminFilterDraft, level })
          }
          ariaLabel="난이도 필터"
        />
      </div>
      <div className="dialog-filter-section">
        <span className="form-label">유형</span>
        <OptionButtons
          value={adminFilterDraft.length}
          options={[
            { value: "all", label: "전체" },
            ...Object.entries(lengthLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
          onChange={(length) =>
            setAdminFilterDraft({ ...adminFilterDraft, length })
          }
          ariaLabel="유형 필터"
        />
      </div>
      <label className="dialog-filter-section">
        <span className="form-label">주제</span>
        <select
          className="select-field"
          value={adminFilterDraft.topic}
          onChange={(event) =>
            setAdminFilterDraft({
              ...adminFilterDraft,
              topic: event.target.value,
            })
          }
        >
          <option value="all">전체</option>
          {topics.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <div className="dialog-filter-section">
        <span className="form-label">상태</span>
        <OptionButtons
          value={adminFilterDraft.status}
          options={[
            { value: "all", label: "전체" },
            { value: "review", label: "검토 중" },
            { value: "held", label: "보류" },
            { value: "published", label: "게시" },
          ]}
          onChange={(status) =>
            setAdminFilterDraft({ ...adminFilterDraft, status })
          }
          ariaLabel="상태 필터"
        />
      </div>
      <label className="dialog-filter-section">
        <span className="form-label">정렬</span>
        <select
          className="select-field"
          value={adminFilterDraft.sort}
          onChange={(event) =>
            setAdminFilterDraft({ ...adminFilterDraft, sort: event.target.value })
          }
        >
          <option value="updated-desc">수정일 최신순</option>
          <option value="updated-asc">수정일 오래된순</option>
          <option value="created-desc">등록일 최신순</option>
          <option value="created-asc">등록일 오래된순</option>
          <option value="title-asc">제목 가나다순</option>
          <option value="level-asc">난이도 낮은순</option>
          <option value="level-desc">난이도 높은순</option>
          <option value="perceived-asc">체감 난이도 낮은순</option>
          <option value="perceived-desc">체감 난이도 높은순</option>
          <option value="status-asc">상태순</option>
        </select>
      </label>
    </div>
  );
  const reportDialog = (
    <label className="dialog-report-field">
      <span className="form-label">제보 내용</span>
      <textarea
        className="dialog-report-text"
        value={reportText}
        onChange={(event) => setReportText(event.target.value)}
        placeholder="지문, 문제, 선택지에서 이상한 부분을 알려 주세요."
      />
      {dialogError ? (
        <span className="dialog-field-error">{dialogError}</span>
      ) : null}
    </label>
  );
  const feedbackDialog = (
    <div className="dialog-feedback-field">
      <div className="rating-group">
        <span className="form-label">문항 품질</span>
        <OptionButtons
          value={feedback.quality}
          options={[
            { value: "1", label: "매우 아쉬움" },
            { value: "2", label: "아쉬움" },
            { value: "3", label: "보통" },
            { value: "4", label: "좋음" },
            { value: "5", label: "매우 좋음" },
          ]}
          onChange={(quality) => setFeedback({ ...feedback, quality })}
          ariaLabel="문항 품질"
        />
      </div>
      <div className="rating-group">
        <span className="form-label">체감 난이도</span>
        <OptionButtons
          value={feedback.level}
          options={["N5", "N4", "N3", "N2", "N1"]}
          onChange={(level) => setFeedback({ ...feedback, level })}
          ariaLabel="체감 난이도"
        />
      </div>
      <label className="dialog-feedback-text-label">
        <span className="form-label">개선 의견</span>
        <textarea
          className="dialog-feedback-text"
          value={feedback.comment}
          onChange={(event) =>
            setFeedback({ ...feedback, comment: event.target.value })
          }
        />
      </label>
      {dialogError ? (
        <span className="dialog-field-error">{dialogError}</span>
      ) : null}
    </div>
  );
  const dialogContent =
    dialog?.type === "list-filter"
      ? filterDialog
      : dialog?.type === "admin-filter"
        ? adminFilterDialog
        : dialog?.type === "report"
          ? reportDialog
          : dialog?.type === "feedback"
            ? feedbackDialog
            : null;

  return (
    <main
      className="app"
      data-screen={screen}
      data-role={role}
      data-authenticated={authenticated}
    >
      <div className="shell">
        <header className="topbar">
          <button
            className="wordmark"
            type="button"
            aria-label="YOMITOKU, 読み解く"
            onClick={goHome}
          >
            <span lang="ja">読み解く</span>
          </button>
          <div className="header-actions">
            {authenticated && role === "admin" ? (
              <button
                className="link-button header-admin-link"
                type="button"
                onClick={() =>
                  openDialog({
                    kicker: "Open management",
                    title: "관리자 화면으로 이동할까요?",
                    description:
                      "문항을 생성하고 관리하는 관리자 화면으로 이동합니다.",
                    confirmLabel: "이동하기",
                    onConfirm: () => {
                      closeDialog();
                      setScreen("admin");
                    },
                  })
                }
              >
                관리자 화면
              </button>
            ) : null}
            {authenticated ? (
              <button
                className="header-progress"
                type="button"
                aria-label={`학습 통계: 생성된 전체 문제 ${totalGenerated}개 중 ${completeCount}개 풀이 완료`}
                title="학습 통계"
                onClick={() => setScreen("stats")}
              >
                <Icon icon={BarChart3} />
                <span>
                  {completeCount} / {totalGenerated}
                </span>
              </button>
            ) : null}
            {authenticated ? (
              <button
                className="link-button header-logout-link"
                type="button"
                aria-label="로그아웃"
                title="로그아웃"
                onClick={() =>
                  openDialog({
                    kicker: "Sign out",
                    title: "로그아웃할까요?",
                    description: "이 기기에서 현재 계정의 로그인이 해제됩니다.",
                    confirmLabel: "로그아웃",
                    onConfirm: () => {
                      closeDialog();
                      setAuthenticated(false);
                      setRole("learner");
                      setScreen("home");
                      setToast("로그아웃되었습니다.");
                    },
                  })
                }
              >
                <Icon icon={LogOut} />
              </button>
            ) : (
              <button
                className="link-button header-login-link"
                type="button"
                onClick={() =>
                  openDialog({
                    kicker: "Sign in",
                    title: "로그인할까요?",
                    description:
                      "로그인하면 풀이 결과와 학습 통계를 기록할 수 있습니다.",
                    confirmLabel: "로그인하기",
                    onConfirm: () => {
                      closeDialog();
                      setAuthenticated(true);
                      setRole("admin");
                      setToast("로그인되었습니다.");
                    },
                  })
                }
              >
                <Icon icon={LogIn} />
                로그인
              </button>
            )}
          </div>
        </header>
        <Breadcrumb screen={screen} />
        <ListScreen
          items={publishedItems}
          authenticated={authenticated}
          attempts={attempts}
          filters={filters}
          setFilters={setFilters}
          onOpenFilters={() =>
            (setFilterDraft(filters),
            openDialog({
              type: "list-filter",
              kicker: "Filter list",
              title: "필터 및 정렬",
              description: "조건을 선택한 뒤 적용해 주세요.",
              confirmLabel: "적용하기",
              onConfirm: () => {
                setFilters(filterDraftRef.current);
                closeDialog();
              },
            }))
          }
          onStart={start}
        />
        <ReadingScreen
          item={activeItem}
          attempt={attempt}
          result={result}
          onChoose={(id) =>
            setAttempt({ ...attempt, selectedChoiceId: id, message: "" })
          }
          onSubmit={submit}
          onAbandon={goHome}
          onReport={() => {
            setReportText("");
            openDialog({
              type: "report",
              kicker: "Report issue",
              title: "오류를 알려주세요",
              description: "제보는 이 문항 정보와 함께 검토됩니다.",
              confirmLabel: "제보 보내기",
              onConfirm: () => {
                if (!reportText.trim()) {
                  setDialogError("제보 내용을 입력해 주세요.");
                  return;
                }
                closeDialog();
                setToast("오류 제보가 접수되었습니다. 고맙습니다.");
              },
            });
          }}
          onResult={() => setScreen("result")}
        />
        <ResultScreen
          result={result}
          onFeedback={() => {
            setFeedback({ quality: "", level: "", comment: "" });
            openDialog({
              type: "feedback",
              kicker: "Rate question",
              title: "문항을 평가해 주세요",
              description: "다음 문항을 만드는 데 반영합니다.",
              confirmLabel: "평가 보내기",
              onConfirm: () => {
                if (!feedback.quality || !feedback.level) {
                  setDialogError("문항 품질과 체감 난이도를 선택해 주세요.");
                  return;
                }
                closeDialog();
                setToast("문항 평가가 반영되었습니다. 고맙습니다.");
              },
            });
          }}
          onContinue={() => {
            const current = result.isCorrect
              ? publishedItems[
                  (publishedItems.findIndex(
                    (item) => item.id === result.item.id,
                  ) +
                    1) %
                    publishedItems.length
                ]
              : result.item;
            start(current);
          }}
          onHome={goHome}
        />
        <StatsScreen attempts={attempts} />
        <AdminScreen
          items={items}
          filters={adminFilters}
          onFilters={() =>
            (setAdminFilterDraft(adminFilters),
            openDialog({
              type: "admin-filter",
              kicker: "Filter management",
              title: "문항 필터 및 정렬",
              description: "조건을 선택한 뒤 적용해 주세요.",
              confirmLabel: "적용하기",
              onConfirm: () => {
                setAdminFilters(adminFilterDraftRef.current);
                closeDialog();
              },
            }))
          }
          onEdit={(item) => {
            setEditingId(item.id);
            setDraft(structuredClone(item));
            setScreen("admin-edit");
          }}
          onGenerate={() => setScreen("generate")}
        />
        <AdminEdit
          item={editingItem}
          draft={draft}
          setDraft={setDraft}
          onSave={() => {
            updateItem(editingItem.id, draft);
            setToast("문항 변경사항을 저장했습니다.");
          }}
          onHold={() => {
            if (editingItem.status === "published")
              openDialog({
                kicker: "Hold published item",
                title: "게시 문항을 보류로 전환할까요?",
                description:
                  "전환하면 학습자 목록에서 이 문항을 볼 수 없습니다.",
                confirmLabel: "보류로 전환",
                onConfirm: () => {
                  closeDialog();
                  updateItem(editingItem.id, { status: "held" });
                  setToast("게시 문항을 보류로 전환했습니다.");
                },
              });
            else {
              const status = editingItem.status === "held" ? "review" : "held";
              updateItem(editingItem.id, { status });
              setToast(
                status === "held"
                  ? "문항을 보류했습니다."
                  : "문항 보류를 취소했습니다.",
              );
            }
          }}
          onPublish={() =>
            openDialog({
              kicker: "Publish item",
              title: "문항을 게시할까요?",
              description:
                "게시한 문항은 학습자 목록에서 바로 풀이할 수 있습니다.",
              confirmLabel: "게시하기",
              onConfirm: () => {
                closeDialog();
                updateItem(editingItem.id, {
                  status: "published",
                  publishedAt:
                    editingItem.publishedAt ?? new Date().toISOString(),
                });
                setToast("문항을 게시했습니다.");
              },
            })
          }
          onDelete={() => deleteItem(editingItem)}
          onBack={() =>
            openDialog({
              kicker: "Back to management",
              title: "문항 관리로 돌아갈까요?",
              description: "현재 화면을 닫고 관리자 문항 관리로 돌아갑니다.",
              confirmLabel: "관리 목록으로",
              onConfirm: () => {
                closeDialog();
                setScreen("admin");
              },
            })
          }
        />
        <GenerateScreen
          values={generation}
          setValues={setGeneration}
          onCreate={createDraft}
          onBack={() => setScreen("admin")}
        />
        <PreviewScreen
          item={previewItem}
          onHold={() => {
            const status = previewItem.status === "held" ? "review" : "held";
            updateItem(previewItem.id, { status });
            setToast(
              status === "held"
                ? "문항을 보류했습니다."
                : "문항 보류를 취소했습니다.",
            );
          }}
          onPublish={() =>
            openDialog({
              kicker: "Publish draft",
              title: "문항을 게시할까요?",
              description: "게시한 문항은 목록에서 바로 풀이할 수 있습니다.",
              confirmLabel: "게시하기",
              onConfirm: () => {
                closeDialog();
                updateItem(previewItem.id, {
                  status: "published",
                  publishedAt: new Date().toISOString(),
                });
                setScreen("admin");
                setToast("문항을 게시했습니다.");
              },
            })
          }
          onDelete={() => deleteItem(previewItem)}
          onBack={() => setScreen("admin")}
        />
      </div>
      <nav className="scroll-controls" aria-label="통계 페이지 이동">
        <button
          className="scroll-control-button"
          type="button"
          aria-label="통계 맨 위로"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <Icon icon={ChevronUp} />
        </button>
        <button
          className="scroll-control-button"
          type="button"
          aria-label="통계 맨 아래로"
          onClick={() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: "smooth",
            })
          }
        >
          <Icon icon={ChevronDown} />
        </button>
      </nav>
      <Dialog dialog={dialog} onClose={closeDialog}>
        {dialogContent}
      </Dialog>
      {toast ? (
        <div className="toast is-visible" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
