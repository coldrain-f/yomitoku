import type { CSSProperties } from "react";
import type { Statistics } from "../../lib/api";
import { formatTime } from "../../lib/reading";
import { useI18n } from "../../lib/i18n";
import type { DifficultyLevel, LengthType } from "../../types";

interface StatsScreenProps {
  statistics: Statistics | null;
}

type ProgressStyle = CSSProperties & Record<"--progress", string>;

export function StatsScreen({ statistics }: StatsScreenProps) {
  const { t, levelLabel, lengthLabel } = useI18n();

  if (!statistics) {
    return (
      <section className="screen screen-stats" aria-label={t("stats.aria")}>
        <div className="paper">{t("stats.loading")}</div>
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
          {t("stats.completedCount", { completed, total })}
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
          {t("stats.barAccuracy")} <strong>{accuracy === null ? "-" : `${accuracy}%`}</strong>
        </span>
        <span>
          {t("stats.barAverage")} {averageElapsedSeconds === null ? "-" : formatTime(averageElapsedSeconds)}
        </span>
      </p>
    </article>
  );

  const total = statistics.totalGeneratedCount;
  const completed = statistics.completedCount;
  return (
    <section className="screen screen-stats" aria-label={t("stats.aria")}>
      <div className="paper">
        <div className="stats-heading">
          <div>
            <p className="kicker">{t("stats.kicker")}</p>
            <h1 className="screen-title">{t("stats.title")}</h1>
          </div>
          <span className="badge">{t("stats.generated", { count: total })}</span>
        </div>
        <div className="stats-overview">
          <div className="stats-overview-item">
            <span className="stats-label">{t("stats.completed")}</span>
            <strong className="stats-value">
              {completed} / {total}
            </strong>
            <span className="stats-detail">{t("stats.completedDetail")}</span>
          </div>
          <div className="stats-overview-item">
            <span className="stats-label">{t("stats.accuracy")}</span>
            <strong className="stats-value">
              {statistics.accuracy === null ? "-" : `${statistics.accuracy}%`}
            </strong>
            <span className="stats-detail">{t("stats.latestDetail")}</span>
          </div>
          <div className="stats-overview-item">
            <span className="stats-label">{t("stats.averageTime")}</span>
            <strong className="stats-value">
              {statistics.averageElapsedSeconds === null
                ? "-"
                : formatTime(statistics.averageElapsedSeconds)}
            </strong>
            <span className="stats-detail">{t("stats.latestDetail")}</span>
          </div>
        </div>
        <p className="stats-aggregation-note">
          {t("stats.note")}
        </p>
        <section className="stats-section stats-progress-section">
          <div className="stats-section-heading">
            <h2 className="stats-section-title">{t("stats.progress")}</h2>
            <span className="stats-section-note">{t("stats.unstarted", { count: total - completed })}</span>
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
            <h2 className="stats-section-title">{t("stats.byLength")}</h2>
            <span className="stats-section-note">{t("stats.generatedBasis")}</span>
          </div>
          <div className="stats-bar-list">
            {statistics.byLength.map((group) =>
              bar(
                lengthLabel(group.key as LengthType),
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
            <h2 className="stats-section-title">{t("stats.byLevel")}</h2>
            <span className="stats-section-note">{t("stats.generatedBasis")}</span>
          </div>
          <div className="stats-bar-list">
            {statistics.byLevel.map((group) =>
              bar(
                levelLabel(group.key as DifficultyLevel),
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
