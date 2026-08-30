import type { CSSProperties } from "react";
import type { Statistics } from "../../lib/api";
import { formatTime, lengthLabels } from "../../lib/reading";
import type { DifficultyLevel, LengthType } from "../../types";

interface StatsScreenProps {
  statistics: Statistics | null;
}

type ProgressStyle = CSSProperties & Record<"--progress", string>;

export function StatsScreen({ statistics }: StatsScreenProps) {
  if (!statistics) {
    return (
      <section className="screen screen-stats" aria-label="학습 통계">
        <div className="paper">학습 통계를 불러오는 중입니다.</div>
      </section>
    );
  }

  const bar = (
    label: string,
    total: number,
    completed: number,
    accuracy: number | null,
    averageElapsedSeconds: number | null,
  ) => (
    <article
      className={`stats-bar-row${completed ? "" : " is-empty"}`}
      key={label}
    >
      <div className="stats-bar-topline">
        <strong>{label}</strong>
        <span className="stats-bar-count">
          {completed} / {total} 완료
        </span>
      </div>
      <div className="stats-bar-track">
        <span
          className="stats-bar-fill"
          style={
            { "--progress": `${total ? (completed / total) * 100 : 0}%` } as ProgressStyle
          }
        />
      </div>
      <p className="stats-bar-meta">
        <span>
          정답률 <strong>{accuracy === null ? "-" : `${accuracy}%`}</strong>
        </span>
        <span>
          평균 {averageElapsedSeconds === null ? "-" : formatTime(averageElapsedSeconds)}
        </span>
      </p>
    </article>
  );

  const total = statistics.totalGeneratedCount;
  const completed = statistics.completedCount;
  return (
    <section className="screen screen-stats" aria-label="학습 통계">
      <div className="paper">
        <div className="stats-heading">
          <div>
            <p className="kicker">Learning record</p>
            <h1 className="screen-title">학습 통계</h1>
          </div>
          <span className="badge">생성된 문제 {total}개</span>
        </div>
        <div className="stats-overview">
          <div className="stats-overview-item">
            <span className="stats-label">풀이 완료</span>
            <strong className="stats-value">
              {completed} / {total}
            </strong>
            <span className="stats-detail">1회 이상 제출한 고유 문항</span>
          </div>
          <div className="stats-overview-item">
            <span className="stats-label">전체 정답률</span>
            <strong className="stats-value">
              {statistics.accuracy === null ? "-" : `${statistics.accuracy}%`}
            </strong>
            <span className="stats-detail">문항별 최근 제출 기준</span>
          </div>
          <div className="stats-overview-item">
            <span className="stats-label">평균 풀이 시간</span>
            <strong className="stats-value">
              {statistics.averageElapsedSeconds === null
                ? "-"
                : formatTime(statistics.averageElapsedSeconds)}
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
            <span className="stats-section-note">미풀이 {total - completed}문항</span>
          </div>
          <div className="stats-progress-track">
            <span
              className="stats-progress-fill"
              style={
                { "--progress": `${total ? (completed / total) * 100 : 0}%` } as ProgressStyle
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
            {statistics.byLength.map((group) =>
              bar(
                lengthLabels[group.key as LengthType],
                group.totalCount,
                group.completedCount,
                group.accuracy,
                group.averageElapsedSeconds,
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
            {statistics.byLevel.map((group) =>
              bar(
                group.key as DifficultyLevel,
                group.totalCount,
                group.completedCount,
                group.accuracy,
                group.averageElapsedSeconds,
              ),
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
