import type { CSSProperties } from "react";
import {
  formatTime,
  latestAttempts,
  lengthLabels,
  levelTotals,
  totalGeneratedInitial,
  typeTotals,
} from "../../lib/reading";
import type { AttemptRecord, DifficultyLevel, LengthType } from "../../types";

interface StatsScreenProps {
  attempts: AttemptRecord[];
}

type ProgressStyle = CSSProperties & Record<"--progress", string>;

export function StatsScreen({ attempts }: StatsScreenProps) {
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
  const bar = (label: string, total: number, entries: AttemptRecord[]) => {
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
            style={{ "--progress": `${(entries.length / total) * 100}%` } as ProgressStyle}
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
          <span className="badge">생성된 문제 {totalGeneratedInitial}개</span>
        </div>
        <div className="stats-overview">
          <div className="stats-overview-item">
            <span className="stats-label">풀이 완료</span>
            <strong className="stats-value">
              {records.length} / {totalGeneratedInitial}
            </strong>
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
              미풀이 {totalGeneratedInitial - records.length}문항
            </span>
          </div>
          <div className="stats-progress-track">
            <span
              className="stats-progress-fill"
              style={
                {
                  "--progress": `${(records.length / totalGeneratedInitial) * 100}%`,
                } as ProgressStyle
              }
            />
          </div>
        </section>
        <section className="stats-section">
          <div className="stats-section-heading">
            <h2 className="stats-section-title">유형별 풀이 현황</h2>
            <span className="stats-section-note">생성된 문제 기준</span>
          </div>
          <div className="stats-bar-list">
            {(Object.entries(typeTotals) as [LengthType, number][]).map(
              ([type, total]) =>
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
            {(Object.entries(levelTotals) as [DifficultyLevel, number][]).map(
              ([level, total]) =>
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
