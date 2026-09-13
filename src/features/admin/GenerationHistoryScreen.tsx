import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import { ListPagination } from "../../components/ui/ListPagination";
import { LoadingBar } from "../../components/ui/LoadingBar";
import { useI18n, type TranslationFunction } from "../../lib/i18n";
import type { GenerationJobHistory } from "../../lib/api";

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

function generationStageLabel(stage: string, t: TranslationFunction): string {
  return {
    generate: t("admin.stageGenerate"),
    verify_answer: t("admin.stageVerifyAnswer"),
    verify_quality: t("admin.stageVerifyQuality"),
  }[stage] ?? stage;
}

function generationStatusLabel(status: string, t: TranslationFunction): string {
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
  return value === null
    ? "-"
    : new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "ko-KR").format(value);
}

function formatCost(value: number | null, t: TranslationFunction): string {
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
