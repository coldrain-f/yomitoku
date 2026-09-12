import { OptionButtons } from "./ui/OptionButtons";
import { ListPagination } from "./ui/ListPagination";
import { Trash2 } from "lucide-react";
import { Icon } from "./ui/Icon";
import { formatDate } from "../lib/reading";
import { useI18n } from "../lib/i18n";
import {
  generationLevelsForLanguage,
  levelsForLanguage,
  readingTopics,
} from "../lib/readingPolicy";
import type { ReadingTranslation } from "../lib/api";
import type {
  AdminFilters,
  DialogConfig,
  FeedbackValues,
  HighlightCollectionPage,
  HighlightRemovalConfirmation,
  ListFilters,
  ReadingLanguage,
  StateSetter,
} from "../types";

interface AppDialogContentProps {
  type: DialogConfig["type"];
  authenticated: boolean;
  filterDraft: ListFilters;
  setFilterDraft: StateSetter<ListFilters>;
  adminFilterDraft: AdminFilters;
  setAdminFilterDraft: StateSetter<AdminFilters>;
  reportText: string;
  setReportText: StateSetter<string>;
  feedback: FeedbackValues;
  feedbackLanguage: ReadingLanguage;
  setFeedback: StateSetter<FeedbackValues>;
  dialogError: string;
  translation: ReadingTranslation | null;
  translationLoading: boolean;
  translationError: string;
  highlightCollection: HighlightCollectionPage;
  highlightLanguage: "all" | ReadingLanguage;
  highlightQuery: string;
  onHighlightLanguageChange: (language: "all" | ReadingLanguage) => void;
  onHighlightQueryChange: (query: string) => void;
  onHighlightSearch: () => void;
  onHighlightPageChange: (page: number) => void;
  highlightsLoading: boolean;
  highlightsError: string;
  removingHighlightId: string | null;
  highlightRemoval: HighlightRemovalConfirmation | null;
  onCancelHighlightRemoval: () => void;
  onConfirmHighlightRemoval: () => void;
  onRemoveHighlight: (readingItemId: string, highlightId: string) => void | Promise<void>;
}

export function AppDialogContent({
  type,
  authenticated,
  filterDraft,
  setFilterDraft,
  adminFilterDraft,
  setAdminFilterDraft,
  reportText,
  setReportText,
  feedback,
  feedbackLanguage,
  setFeedback,
  dialogError,
  translation,
  translationLoading,
  translationError,
  highlightCollection,
  highlightLanguage,
  highlightQuery,
  onHighlightLanguageChange,
  onHighlightQueryChange,
  onHighlightSearch,
  onHighlightPageChange,
  highlightsLoading,
  highlightsError,
  removingHighlightId,
  highlightRemoval,
  onCancelHighlightRemoval,
  onConfirmHighlightRemoval,
  onRemoveHighlight,
}: AppDialogContentProps) {
  const { locale, t, languageLabel, levelLabel, lengthLabel, topicLabel } = useI18n();

  if (type === "score-guide") {
    return (
      <div className="score-guide-dialog">
        <dl className="score-guide-list">
          <div>
            <dt className="badge ok">✓ 100</dt>
            <dd>{t("score.firstOnTime")}</dd>
          </div>
          <div>
            <dt className="badge warning">✓ 90</dt>
            <dd>{t("score.firstTimedOut")}</dd>
          </div>
          <div>
            <dt className="badge retry">✓ 80</dt>
            <dd>{t("score.retryPassed")}</dd>
          </div>
        </dl>
        <p className="score-guide-note">
          {t("score.note")}
        </p>
      </div>
    );
  }

  if (type === "highlights") {
    return (
      <div className="highlight-collection-dialog">
        <form
          className="highlight-collection-controls"
          onSubmit={(event) => {
            event.preventDefault();
            onHighlightSearch();
          }}
        >
          <label className="sr-only" htmlFor="highlight-collection-search">
            {t("highlights.searchLabel")}
          </label>
          <div className="highlight-collection-search">
            <input
              id="highlight-collection-search"
              type="search"
              value={highlightQuery}
              placeholder={t("highlights.searchPlaceholder")}
              onChange={(event) => onHighlightQueryChange(event.target.value)}
            />
            <button className="text-button" type="submit" disabled={highlightsLoading}>
              {t("highlights.search")}
            </button>
          </div>
          <OptionButtons
            value={highlightLanguage}
            options={[
              { value: "all", label: t("filters.all") },
              { value: "ja", label: languageLabel("ja") },
              { value: "ko", label: languageLabel("ko") },
            ]}
            onChange={(language) =>
              onHighlightLanguageChange(language as "all" | ReadingLanguage)
            }
            ariaLabel={t("highlights.languageAria")}
            disabled={highlightsLoading}
          />
        </form>
        {highlightsLoading ? (
          <div
            className="highlight-collection-loading"
            role="status"
            aria-label={t("highlights.loading")}
          >
            <span className="loading-spinner loading-spinner-large" aria-hidden="true" />
          </div>
        ) : null}
        {highlightsError ? (
          <p className="dialog-field-error" role="alert">
            {highlightsError}
          </p>
        ) : null}
        {!highlightsLoading && !highlightsError && highlightCollection.totalItems === 0 ? (
          <p className="highlight-collection-empty">
            {t("highlights.empty")}
          </p>
        ) : null}
        {!highlightsError && highlightCollection.items.map((item) => (
          <details
            className="highlight-collection-group"
            key={item.readingItemId}
          >
            <summary className="highlight-collection-heading">
              <div>
                <h3>{item.title}</h3>
                <p className="highlight-collection-summary">
                  {t("highlights.count", { count: item.highlights.length })} · {item.lastSubmittedAt
                    ? t("highlights.lastSubmitted", { date: formatDate(item.lastSubmittedAt, locale) })
                    : t("highlights.lastSaved", { date: formatDate(item.lastHighlightedAt, locale) })}
                </p>
              </div>
              <div className="highlight-collection-meta">
                <span className="badge">{languageLabel(item.language)}</span>
                <span className="badge">{levelLabel(item.officialLevel)}</span>
                <span className="badge">{lengthLabel(item.lengthType)}</span>
                <span>{topicLabel(item.topic)}</span>
              </div>
            </summary>
            <ul className="highlight-collection-list">
              {item.highlights.map((highlight) => (
                <li key={highlight.id}>
                  <p lang={item.language}>{highlight.selectedText}</p>
                  <button
                    className="icon-button highlight-collection-remove"
                    type="button"
                    aria-label={`${item.title}: ${t("highlights.remove")}`}
                    title={t("highlights.remove")}
                    disabled={removingHighlightId === highlight.id}
                    onClick={() =>
                      void onRemoveHighlight(
                        item.readingItemId,
                        highlight.id,
                      )
                    }
                  >
                    <Icon icon={Trash2} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!highlightsError && highlightCollection.totalItems > 0 ? (
          <div className="highlight-collection-pagination">
            <span>
              {t("highlights.pageStatus", {
                total: highlightCollection.totalItems,
                page: highlightCollection.page,
                pages: highlightCollection.totalPages,
              })}
            </span>
            {highlightCollection.totalPages > 1 ? (
              <ListPagination
                page={highlightCollection.page}
                totalPages={highlightCollection.totalPages}
                onChange={onHighlightPageChange}
                ariaLabel={t("highlights.pagination")}
              />
            ) : null}
          </div>
        ) : null}
        {highlightRemoval ? (
          <div
            className="highlight-removal-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="highlight-removal-title"
          >
            <div className="highlight-removal-confirmation-card">
              <p className="kicker">{t("highlights.removeKicker")}</p>
              <h3 id="highlight-removal-title">{t("highlights.removeTitle")}</h3>
              <p className="highlight-removal-title">{highlightRemoval.title}</p>
              <p className="highlight-removal-text" lang={highlightRemoval.language}>
                {highlightRemoval.selectedText}
              </p>
              <div className="highlight-removal-meta">
                <span className="badge">{levelLabel(highlightRemoval.officialLevel)}</span>
                <span className="badge">{lengthLabel(highlightRemoval.lengthType)}</span>
                <span>{topicLabel(highlightRemoval.topic)}</span>
              </div>
              <p className="highlight-removal-note">{t("highlights.removeNote")}</p>
              <div className="highlight-removal-actions">
                <button className="text-button" type="button" onClick={onCancelHighlightRemoval}>
                  {t("common.cancel")}
                </button>
                <button className="primary-button danger-button" type="button" onClick={onConfirmHighlightRemoval}>
                  {t("highlights.removeConfirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (type === "list-filter") {
    return (
      <div className="dialog-filter-field">
        <div className="dialog-filter-section">
          <span className="form-label">{t("filters.level")}</span>
          <OptionButtons
            value={filterDraft.level}
            options={[
              { value: "all", label: t("filters.all") },
              ...levelsForLanguage(filterDraft.language).map((value) => ({
                value,
                label: levelLabel(value),
              })),
            ]}
            onChange={(level) =>
              setFilterDraft({
                ...filterDraft,
                level: level as ListFilters["level"],
              })
            }
            ariaLabel={t("filters.levelAria")}
          />
        </div>
        <div className="dialog-filter-section">
          <span className="form-label">{t("filters.length")}</span>
          <OptionButtons
            value={filterDraft.length}
            options={[
              { value: "all", label: t("filters.all") },
              ...(["short", "medium", "long"] as const).map((value) => ({
                value,
                label: lengthLabel(value),
              })),
            ]}
            onChange={(length) =>
              setFilterDraft({
                ...filterDraft,
                length: length as ListFilters["length"],
              })
            }
            ariaLabel={t("filters.lengthAria")}
          />
        </div>
        {authenticated ? (
          <>
            <div className="dialog-filter-section">
              <span className="form-label">{t("filters.result")}</span>
              <OptionButtons
                value={filterDraft.status}
                options={[
                  { value: "all", label: t("filters.all") },
                  { value: "unstarted", label: t("filters.unstarted") },
                  { value: "wrong", label: t("filters.wrong") },
                  { value: "score-100", label: t("common.score", { score: 100 }) },
                  { value: "score-90", label: t("common.score", { score: 90 }) },
                  { value: "score-80", label: t("common.score", { score: 80 }) },
                ]}
                onChange={(status) =>
                  setFilterDraft({
                    ...filterDraft,
                    status: status as ListFilters["status"],
                  })
                }
                ariaLabel={t("filters.resultAria")}
              />
            </div>
            <div className="dialog-filter-section">
              <span className="form-label">{t("filters.firstTime")}</span>
              <OptionButtons
                value={filterDraft.firstSubmissionTime}
                options={[
                  { value: "all", label: t("filters.all") },
                  { value: "on-time", label: t("filters.onTime") },
                  { value: "timed-out", label: t("filters.timedOut") },
                ]}
                onChange={(firstSubmissionTime) =>
                  setFilterDraft({
                    ...filterDraft,
                    firstSubmissionTime: firstSubmissionTime as ListFilters["firstSubmissionTime"],
                  })
                }
                ariaLabel={t("filters.timeAria")}
              />
            </div>
          </>
        ) : null}
        <label className="dialog-filter-section">
          <span className="form-label">{t("filters.sort")}</span>
          <select
            className="select-field"
            value={filterDraft.sort}
            onChange={(event) =>
              setFilterDraft({
                ...filterDraft,
                sort: event.target.value as ListFilters["sort"],
              })
            }
          >
            <option value="published-desc">{t("filters.publishedDesc")}</option>
            <option value="published-asc">{t("filters.publishedAsc")}</option>
            <option value="level-asc">{t("filters.levelAsc")}</option>
            <option value="level-desc">{t("filters.levelDesc")}</option>
            <option value="perceived-asc">{t("filters.perceivedAsc")}</option>
            <option value="perceived-desc">{t("filters.perceivedDesc")}</option>
            <option value="score-desc">{t("filters.scoreDesc")}</option>
            <option value="score-asc">{t("filters.scoreAsc")}</option>
          </select>
        </label>
      </div>
    );
  }

  if (type === "admin-filter") {
    return (
      <div className="dialog-admin-filter-field">
        <div className="dialog-filter-section">
          <span className="form-label">{t("filters.level")}</span>
          <OptionButtons
            value={adminFilterDraft.level}
            options={[
              { value: "all", label: t("filters.all") },
              ...levelsForLanguage(adminFilterDraft.language).map((value) => ({
                value,
                label: levelLabel(value),
              })),
            ]}
            onChange={(level) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                level: level as AdminFilters["level"],
              })
            }
            ariaLabel={t("filters.levelAria")}
          />
        </div>
        <div className="dialog-filter-section">
          <span className="form-label">{t("filters.length")}</span>
          <OptionButtons
            value={adminFilterDraft.length}
            options={[
              { value: "all", label: t("filters.all") },
              ...(["short", "medium", "long"] as const).map((value) => ({
                value,
                label: lengthLabel(value),
              })),
            ]}
            onChange={(length) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                length: length as AdminFilters["length"],
              })
            }
            ariaLabel={t("filters.lengthAria")}
          />
        </div>
        <label className="dialog-filter-section">
          <span className="form-label">{t("admin.topic")}</span>
          <select
            className="select-field"
            value={adminFilterDraft.topic}
            onChange={(event) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                topic: event.target.value as AdminFilters["topic"],
              })
            }
          >
            <option value="all">{t("filters.all")}</option>
            {readingTopics.map((topic) => (
              <option key={topic}>{topicLabel(topic)}</option>
            ))}
          </select>
        </label>
        <div className="dialog-filter-section">
          <span className="form-label">{t("admin.status")}</span>
          <OptionButtons
            value={adminFilterDraft.status}
            options={[
              { value: "all", label: t("filters.all") },
              { value: "review", label: t("admin.statusReview") },
              { value: "held", label: t("admin.statusHeld") },
              { value: "published", label: t("admin.statusPublished") },
            ]}
            onChange={(status) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                status: status as AdminFilters["status"],
              })
            }
            ariaLabel={t("admin.statusAria")}
          />
        </div>
        <label className="dialog-filter-section">
          <span className="form-label">{t("filters.sort")}</span>
          <select
            className="select-field"
            value={adminFilterDraft.sort}
            onChange={(event) =>
              setAdminFilterDraft({
                ...adminFilterDraft,
                sort: event.target.value as AdminFilters["sort"],
              })
            }
          >
            <option value="created-desc">{t("admin.createdDesc")}</option>
            <option value="created-asc">{t("admin.createdAsc")}</option>
            <option value="updated-desc">{t("admin.updatedDesc")}</option>
            <option value="updated-asc">{t("admin.updatedAsc")}</option>
            <option value="title-asc">{t("admin.titleAsc")}</option>
            <option value="level-asc">{t("filters.levelAsc")}</option>
            <option value="level-desc">{t("filters.levelDesc")}</option>
            <option value="perceived-asc">{t("filters.perceivedAsc")}</option>
            <option value="perceived-desc">{t("filters.perceivedDesc")}</option>
            <option value="status-asc">{t("admin.statusAsc")}</option>
          </select>
        </label>
      </div>
    );
  }

  if (type === "report") {
    return (
      <label className="dialog-report-field">
        <span className="form-label">{t("report.field")}</span>
        <textarea
          className="dialog-report-text"
          value={reportText}
          onChange={(event) => setReportText(event.target.value)}
          placeholder={t("report.placeholder")}
        />
        {dialogError ? (
          <span className="dialog-field-error">{dialogError}</span>
        ) : null}
      </label>
    );
  }

  if (type === "feedback") {
    return (
      <div className="dialog-feedback-field">
        <div className="rating-group">
          <span className="form-label">{t("feedback.quality")}</span>
          <OptionButtons
            value={feedback.quality}
            options={[
              { value: "1", label: t("feedback.quality1") },
              { value: "2", label: t("feedback.quality2") },
              { value: "3", label: t("feedback.quality3") },
              { value: "4", label: t("feedback.quality4") },
              { value: "5", label: t("feedback.quality5") },
            ]}
            onChange={(quality) =>
              setFeedback({
                ...feedback,
                quality: quality as FeedbackValues["quality"],
              })
            }
            ariaLabel={t("feedback.quality")}
          />
        </div>
        <div className="rating-group">
          <span className="form-label">{t("feedback.level")}</span>
          <OptionButtons
            value={feedback.level}
            options={generationLevelsForLanguage(feedbackLanguage)}
            onChange={(level) =>
              setFeedback({
                ...feedback,
                level: level as FeedbackValues["level"],
              })
            }
            ariaLabel={t("feedback.level")}
          />
        </div>
        <label className="dialog-feedback-text-label">
          <span className="form-label">{t("feedback.comment")}</span>
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
  }

  if (type === "translation") {
    const choiceLabels = ["①", "②", "③", "④"];
    const translationSections = translation
      ? [
          { label: t("translation.headingTitle"), segment: translation.title, isChoice: false },
          { label: t("translation.headingPassage"), segment: translation.passage, isChoice: false },
          ...(
            translation.questions.length
              ? translation.questions
              : [translation.question]
          ).flatMap((segment, questionIndex, questions) => [
            {
              label: questions.length > 1
                ? t("translation.headingQuestion", { number: questionIndex + 1 })
                : t("translation.headingQuestionSingle"),
              segment,
              isChoice: false,
            },
            ...(translation.questionChoices?.[questionIndex] ?? []).map(
              (choice, choiceIndex) => ({
                label: t("translation.headingChoice", {
                  number: choiceLabels[choiceIndex] ?? choiceIndex + 1,
                }),
                segment: choice,
                isChoice: true,
              }),
            ),
          ]),
        ]
      : [];
    return (
      <div className="translation-dialog">
        {translationLoading ? (
          <p className="translation-status" role="status">
            {t("translation.loading")}
          </p>
        ) : null}
        {translationError ? (
          <p className="dialog-field-error" role="alert">
            {translationError}
          </p>
        ) : null}
        {translation ? (
          <div className="translation-comparison">
            <section className="translation-pane">
              <h3>{t("translation.original", { language: languageLabel(translation.sourceLanguage) })}</h3>
              <dl className="translation-sections">
                {translationSections.map(({ label, segment, isChoice }) => (
                  <div
                    className={`translation-section${isChoice ? " is-choice" : ""}`}
                    key={`${label}-${segment.sourceText}`}
                  >
                    <dt>{label}</dt>
                    <dd lang={translation.sourceLanguage}>{segment.sourceText}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="translation-pane">
              <h3>{t("translation.translated", { language: languageLabel(translation.targetLanguage) })}</h3>
              <dl className="translation-sections">
                {translationSections.map(({ label, segment, isChoice }) => (
                  <div
                    className={`translation-section${isChoice ? " is-choice" : ""}`}
                    key={`${label}-${segment.sourceText}`}
                  >
                    <dt>{label}</dt>
                    <dd lang={translation.targetLanguage}>
                      {segment.translatedText}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
